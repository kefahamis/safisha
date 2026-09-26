import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Contract tests for the live integrations. Nothing leaves the machine: fetch
 * is replaced, and each provider answers with the payloads its documentation
 * gives. What's checked is our side of the contract: the requests we send
 * (endpoints, auth, field names and formats) and how we handle what comes back,
 * including Safaricom's callbacks. A pilot with real sandbox keys is still the
 * final proof; these keep the code honest in between.
 */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-integrations-")), "db");
process.env.DEMO_DATA = "1";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.PUBLIC_BASE_URL = "https://zoa.example";

const load = async () => ({
  ...(await import("@/server/db")),
  t: await import("@/server/db/schema"),
  settings: await import("@/server/settings"),
  payments: await import("@/server/payments"),
  messaging: await import("@/server/integrations/messaging"),
});
let m: Awaited<ReturnType<typeof load>>;

interface Call {
  url: string;
  init: RequestInit;
}
let calls: Call[] = [];

/** Answers fetch by URL, recording every request. */
function provider(routes: Record<string, (call: Call) => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const call = { url: String(input), init };
      calls.push(call);
      const hit = Object.entries(routes).find(([prefix]) => call.url.startsWith(prefix));
      if (!hit) throw new Error(`Unexpected request to ${call.url}`);
      return hit[1](call);
    }),
  );
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const bodyOf = (c: Call) => JSON.parse(String(c.init.body));
const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);

afterEach(() => {
  vi.unstubAllGlobals();
  calls = [];
});

const SHORTCODE = "174379";
const PASSKEY = "test-passkey-0123456789";
let token = "";
let client: { id: string; phone: string };

beforeAll(async () => {
  m = await load();
  const db = await m.getDb();
  [client] = await db.select().from(m.t.clients).where(eq(m.t.clients.company, "TS")).limit(1);

  await m.settings.saveSetting(
    "TS",
    "mpesa",
    {
      config: { environment: "sandbox", shortcodeType: "paybill", shortcode: SHORTCODE },
      secrets: { consumerKey: "ck-test", consumerSecret: "cs-test", passkey: PASSKEY },
    },
    "test",
  );
  await m.settings.setStatus("TS", "mpesa", true, "Test keys");
  token = (await m.payments.liveMpesa("TS"))!.webhookToken;
});

const daraja = (extra: Record<string, (c: Call) => Response> = {}) =>
  provider({
    "https://sandbox.safaricom.co.ke/oauth/v1/generate": () => json({ access_token: "tok-123", expires_in: "3599" }),
    ...extra,
  });

describe("M-Pesa STK Push (Daraja)", () => {
  let checkout = "";

  it("sends the prompt Safaricom documents", async () => {
    daraja({
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest": () =>
        json({
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_191220191020363925",
          ResponseCode: "0",
          ResponseDescription: "Success. Request accepted for processing",
          CustomerMessage: "Success. Request accepted for processing",
        }),
    });
    const res = await m.payments.startStk({ company: "TS", client: client.id, phone: "0712 345 678", amount: 600.4, purpose: "bill" });
    expect(res).toMatchObject({ ok: true, mode: "live", id: "ws_CO_191220191020363925" });
    checkout = res.ok ? res.id : "";

    const oauth = calls.find((c) => c.url.includes("/oauth/"))!;
    expect(header(oauth, "Authorization")).toBe(`Basic ${Buffer.from("ck-test:cs-test").toString("base64")}`);

    const push = calls.find((c) => c.url.includes("/stkpush/"))!;
    expect(header(push, "Authorization")).toBe("Bearer tok-123");
    const b = bodyOf(push);
    expect(b.Timestamp).toMatch(/^\d{14}$/);
    expect(b.Password).toBe(Buffer.from(`${SHORTCODE}${PASSKEY}${b.Timestamp}`).toString("base64"));
    expect(b).toMatchObject({
      BusinessShortCode: SHORTCODE,
      TransactionType: "CustomerPayBillOnline",
      Amount: 600,
      PartyA: "254712345678",
      PartyB: SHORTCODE,
      PhoneNumber: "254712345678",
      CallBackURL: `https://zoa.example/api/pay/stk/TS/${token}`,
    });
    expect(b.AccountReference.length).toBeLessThanOrEqual(12);
    expect(b.TransactionDesc.length).toBeLessThanOrEqual(13);
  });

  it("ignores a callback without the right token", async () => {
    const res = await m.payments.handleStkCallback("TS", "wrong", { Body: { stkCallback: { MerchantRequestID: "x", CheckoutRequestID: checkout, ResultCode: 0, ResultDesc: "ok" } } });
    expect(res.accepted).toBe(false);
  });

  it("posts the payment from Safaricom's success callback, once", async () => {
    const callback = {
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: checkout,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 600 },
              { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
              { Name: "TransactionDate", Value: 20191219102115 },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    };
    expect((await m.payments.handleStkCallback("TS", token, callback)).accepted).toBe(true);
    // Safaricom retries callbacks; a repeat must not pay twice.
    expect((await m.payments.handleStkCallback("TS", token, callback)).accepted).toBe(true);

    const db = await m.getDb();
    const paid = await db.select().from(m.t.txns).where(eq(m.t.txns.id, "NLJ7RT61SV"));
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ client: client.id, kind: "payment", amount: 600, channel: "STK Push", payer: "0712 345 678" });
    const [req] = await db.select().from(m.t.stkRequests).where(eq(m.t.stkRequests.id, checkout));
    expect(req).toMatchObject({ status: "success", receipt: "NLJ7RT61SV" });
  });

  it("records a cancelled prompt without a payment", async () => {
    daraja({
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest": () =>
        json({ MerchantRequestID: "m-2", CheckoutRequestID: "ws_CO_cancelled", ResponseCode: "0", ResponseDescription: "ok", CustomerMessage: "ok" }),
    });
    await m.payments.startStk({ company: "TS", client: client.id, phone: client.phone, amount: 600, purpose: "bill" });
    await m.payments.handleStkCallback("TS", token, {
      Body: { stkCallback: { MerchantRequestID: "m-2", CheckoutRequestID: "ws_CO_cancelled", ResultCode: 1032, ResultDesc: "Request cancelled by user" } },
    });
    const db = await m.getDb();
    const [req] = await db.select().from(m.t.stkRequests).where(eq(m.t.stkRequests.id, "ws_CO_cancelled"));
    expect(req).toMatchObject({ status: "failed", resultCode: 1032, receipt: null });
  });

  it("surfaces Daraja's error message", async () => {
    daraja({
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest": () =>
        json({ requestId: "r-1", errorCode: "400.002.02", errorMessage: "Bad Request - Invalid PhoneNumber" }, 400),
    });
    const res = await m.payments.startStk({ company: "TS", client: client.id, phone: "0712 345 678", amount: 600, purpose: "bill" });
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? "" : res.error).toContain("Invalid PhoneNumber");
  });
});

describe("M-Pesa Paybill confirmations (C2B)", () => {
  // The confirmation body from Daraja's C2B documentation, addressed to one of our clients.
  const confirmation = (over: Record<string, string> = {}) => ({
    TransactionType: "Pay Bill",
    TransID: "RKTQDM7W6S",
    TransTime: "20191122063845",
    TransAmount: "10",
    BusinessShortCode: SHORTCODE,
    BillRefNumber: client.id,
    InvoiceNumber: "",
    OrgAccountBalance: "49197.00",
    ThirdPartyTransID: "",
    MSISDN: "254708374149",
    FirstName: "John",
    ...over,
  });

  it("matches a payment to the client in the account number, once", async () => {
    expect((await m.payments.handleC2BConfirmation("TS", token, confirmation())).accepted).toBe(true);
    expect((await m.payments.handleC2BConfirmation("TS", token, confirmation())).accepted).toBe(true);
    const db = await m.getDb();
    const rows = await db.select().from(m.t.txns).where(eq(m.t.txns.id, "RKTQDM7W6S"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ client: client.id, amount: 10, channel: "Paybill", payer: "0708 374 149" });
  });

  it("handles the masked numbers newer Daraja versions send", async () => {
    await m.payments.handleC2BConfirmation("TS", token, confirmation({ TransID: "RKTQDM7W6T", MSISDN: "2547 ***** 149" }));
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.txns).where(eq(m.t.txns.id, "RKTQDM7W6T"));
    expect(row.payer).toBe("John");
  });

  it("holds a mistyped account number in suspense", async () => {
    await m.payments.handleC2BConfirmation("TS", token, confirmation({ TransID: "RKTQDM7W6U", BillRefNumber: "TS-KIL-99999" }));
    const db = await m.getDb();
    const [held] = await db.select().from(m.t.suspense).where(eq(m.t.suspense.id, "RKTQDM7W6U"));
    expect(held).toMatchObject({ company: "TS", amount: 10 });
  });

  it("rejects a confirmation without the right token", async () => {
    expect((await m.payments.handleC2BConfirmation("TS", "nope", confirmation({ TransID: "X1" }))).accepted).toBe(false);
  });
});

describe("SMS (Africa's Talking)", () => {
  beforeAll(async () => {
    await m.settings.saveSetting("platform", "sms", { config: { environment: "sandbox", username: "sandbox", senderId: "" }, secrets: { apiKey: "at-key" } }, "test");
    await m.settings.setStatus("platform", "sms", true, "Test keys");
  });

  it("sends in the documented form and reads the delivery status", async () => {
    provider({
      "https://api.sandbox.africastalking.com/version1/messaging": () =>
        json({
          SMSMessageData: {
            Message: "Sent to 1/1 Total Cost: KES 0.8000",
            Recipients: [{ statusCode: 101, number: "+254712345678", status: "Success", cost: "KES 0.8000", messageId: "ATPid_SampleTxnId123" }],
          },
        }),
    });
    const res = await m.messaging.sendSms({ to: "0712 345 678", body: "Hello", purpose: "test" });
    expect(res.status).toBe("sent");
    const [call] = calls;
    expect(header(call, "apiKey")).toBe("at-key");
    const form = new URLSearchParams(String(call.init.body));
    expect(Object.fromEntries(form)).toEqual({ username: "sandbox", to: "+254712345678", message: "Hello" });
  });

  it("records a rejected number as failed, with the reason", async () => {
    provider({
      "https://api.sandbox.africastalking.com/version1/messaging": () =>
        json({ SMSMessageData: { Message: "Sent to 0/1", Recipients: [{ statusCode: 403, number: "+2547", status: "InvalidPhoneNumber", cost: "0", messageId: "None" }] } }),
    });
    const res = await m.messaging.sendSms({ to: "0712", body: "Hello", purpose: "test" });
    expect(res).toEqual({ status: "failed", error: "InvalidPhoneNumber" });
  });
});

describe("Email (Resend)", () => {
  beforeAll(async () => {
    await m.settings.saveSetting("platform", "email", { config: { from: "Zoa <hello@zoa.example>" }, secrets: { apiKey: "re_test" } }, "test");
    await m.settings.setStatus("platform", "email", true, "Test keys");
  });

  it("sends in the documented form", async () => {
    provider({ "https://api.resend.com/emails": () => json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }) });
    const res = await m.messaging.sendEmail({ to: "a@b.co.ke", subject: "Hi", text: "Body" });
    expect(res.status).toBe("sent");
    expect(header(calls[0], "Authorization")).toBe("Bearer re_test");
    expect(bodyOf(calls[0])).toMatchObject({ from: "Zoa <hello@zoa.example>", to: ["a@b.co.ke"], subject: "Hi", text: "Body" });
  });

  it("reports Resend's validation errors", async () => {
    provider({
      "https://api.resend.com/emails": () =>
        json({ statusCode: 422, name: "validation_error", message: "The `from` domain is not verified." }, 422),
    });
    const res = await m.messaging.sendEmail({ to: "a@b.co.ke", subject: "Hi", text: "Body" });
    expect(res.status).toBe("failed");
    expect("error" in res ? res.error : "").toContain("not verified");
  });
});
