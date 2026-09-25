// Server-only. M-Pesa: live via Daraja when configured, simulated otherwise.
import { and, eq, sql } from "drizzle-orm";
import { normalisePhone, parseClientNumber, receiptNumber } from "@/lib/clientNumber";
import { kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { audit } from "./audit";
import { randomToken } from "./crypto";
import { getDb, schema, type Db } from "./db";
import {
  DarajaError,
  callbackMetadata,
  registerC2B,
  simulateC2B,
  stkPush,
  stkQuery,
  type DarajaConfig,
} from "./integrations/daraja";
import { sendSms } from "./integrations/messaging";
import { loadSetting, publicBaseUrl } from "./settings";
import { nowStamp } from "./time";

const { stkRequests, txns, clients, suspense, pickupRequests } = schema;

export interface LiveMpesa {
  config: DarajaConfig;
  webhookToken: string;
}

/** A company's Daraja settings, only once they've tested successfully. */
export async function liveMpesa(company: string): Promise<LiveMpesa | null> {
  const s = await loadSetting(company, "mpesa");
  if (!s || s.status !== "ok") return null;
  const { consumerKey, consumerSecret, passkey } = s.secrets;
  if (!consumerKey || !consumerSecret || !passkey || !s.config.shortcode) return null;
  return {
    config: {
      environment: s.config.environment === "production" ? "production" : "sandbox",
      shortcodeType: s.config.shortcodeType === "till" ? "till" : "paybill",
      shortcode: String(s.config.shortcode),
      tillNumber: s.config.tillNumber ? String(s.config.tillNumber) : undefined,
      consumerKey,
      consumerSecret,
      passkey,
    },
    webhookToken: String(s.config.webhookToken ?? ""),
  };
}

/** Credentials as typed, for "Test connection" before they are trusted. */
export async function draftMpesa(company: string): Promise<DarajaConfig | { error: string }> {
  const s = await loadSetting(company, "mpesa");
  if (!s) return { error: "Save the M-Pesa settings first." };
  const { consumerKey, consumerSecret, passkey } = s.secrets;
  if (!s.config.shortcode) return { error: "Enter the business short code." };
  if (!consumerKey || !consumerSecret) return { error: "Enter the consumer key and secret." };
  if (!passkey) return { error: "Enter the Lipa na M-Pesa Online passkey." };
  return {
    environment: s.config.environment === "production" ? "production" : "sandbox",
    shortcodeType: s.config.shortcodeType === "till" ? "till" : "paybill",
    shortcode: String(s.config.shortcode),
    tillNumber: s.config.tillNumber ? String(s.config.tillNumber) : undefined,
    consumerKey,
    consumerSecret,
    passkey,
  };
}

/* ---------------- posting payments ---------------- */

/**
 * Posts one payment to a client's account. Safe to call twice with the same
 * receipt: Safaricom retries callbacks, and a retry must not credit twice.
 */
async function postPayment(
  db: Db,
  input: { receipt: string; client: string; amount: number; channel: string; payer: string; desc: string },
): Promise<boolean> {
  const inserted = await db
    .insert(txns)
    .values({
      id: input.receipt,
      client: input.client,
      date: nowStamp(),
      kind: "payment",
      amount: Math.round(input.amount),
      desc: input.desc,
      channel: input.channel,
      payer: input.payer,
    })
    .onConflictDoNothing()
    .returning({ id: txns.id });
  return inserted.length > 0;
}

async function balanceOf(db: Db, client: string) {
  const [{ b }] = await db
    .select({
      b: sql<number>`coalesce(sum(case when ${txns.kind} = 'charge' then ${txns.amount} else -${txns.amount} end), 0)::int`,
    })
    .from(txns)
    .where(eq(txns.client, client));
  return b;
}

async function receiptSms(db: Db, clientId: string, receipt: string, amount: number) {
  const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!c) return;
  const bal = await balanceOf(db, c.id);
  const standing = bal > 0 ? `Balance due ${kes(bal)}.` : bal < 0 ? `Credit ${kes(-bal)}.` : "You are paid up.";
  await sendSms({
    to: c.phone,
    company: c.company,
    purpose: "receipt",
    body: `${receipt} confirmed. ${kes(amount)} received for account ${c.id}, ${companyById(c.company).name}. ${standing}`,
  });
}

/* ---------------- STK Push ---------------- */

export type StkStart =
  | { ok: true; id: string; mode: "live" | "simulated"; message: string }
  | { ok: false; error: string };

export async function startStk(input: {
  company: string;
  client: string;
  phone: string;
  amount: number;
  purpose: string;
}): Promise<StkStart> {
  const db = await getDb();
  const live = await liveMpesa(input.company);

  if (!live) {
    const id = `SIM-${randomToken(9)}`;
    await db.insert(stkRequests).values({
      id,
      company: input.company,
      client: input.client,
      phone: normalisePhone(input.phone),
      amount: Math.round(input.amount),
      purpose: input.purpose,
      mode: "simulated",
      status: "pending",
    });
    return { ok: true, id, mode: "simulated", message: "Simulated prompt sent." };
  }

  const base = await publicBaseUrl();
  if (!base || !base.startsWith("https://")) {
    return { ok: false, error: "Payments need the public HTTPS address set in Settings before prompts can be sent." };
  }

  try {
    const res = await stkPush(live.config, {
      phone: input.phone,
      amount: input.amount,
      account: input.client,
      description: "Waste fees",
      callbackUrl: `${base}/api/pay/stk/${input.company}/${live.webhookToken}`,
    });
    await db.insert(stkRequests).values({
      id: res.CheckoutRequestID,
      merchantRequestId: res.MerchantRequestID,
      company: input.company,
      client: input.client,
      phone: normalisePhone(input.phone),
      amount: Math.round(input.amount),
      purpose: input.purpose,
      mode: "live",
      status: "pending",
    });
    return { ok: true, id: res.CheckoutRequestID, mode: "live", message: res.CustomerMessage };
  } catch (err) {
    const message = err instanceof DarajaError ? err.message : "Could not reach Safaricom.";
    return { ok: false, error: message };
  }
}

/** Settles an STK request exactly once, from a callback, a query or the simulator. */
export async function settleStk(
  id: string,
  outcome: { success: boolean; resultCode: number; resultDesc: string; receipt?: string; amount?: number; phone?: string },
) {
  const db = await getDb();
  const [req] = await db.select().from(stkRequests).where(eq(stkRequests.id, id));
  if (!req || req.status !== "pending") return req ?? null;

  const receipt = outcome.success ? (outcome.receipt ?? receiptNumber()) : null;
  const [updated] = await db
    .update(stkRequests)
    .set({
      status: outcome.success ? "success" : "failed",
      resultCode: outcome.resultCode,
      resultDesc: outcome.resultDesc,
      receipt,
      updatedAt: new Date(),
    })
    // Guard against two callbacks racing: only the first moves it off pending.
    .where(and(eq(stkRequests.id, id), eq(stkRequests.status, "pending")))
    .returning();
  if (!updated || !outcome.success || !receipt) return updated ?? req;

  const amount = outcome.amount || req.amount;
  const posted = await postPayment(db, {
    receipt,
    client: req.client,
    amount,
    channel: "STK Push",
    payer: outcome.phone ? normalisePhone(outcome.phone) : req.phone,
    desc: req.purpose.startsWith("pickup:") ? "M-Pesa STK Push · on-demand pickup" : "M-Pesa STK Push",
  });

  if (posted && req.purpose.startsWith("pickup:")) {
    await db
      .update(pickupRequests)
      .set({ paid: true })
      .where(eq(pickupRequests.id, req.purpose.slice("pickup:".length)));
  }
  if (posted) await receiptSms(db, req.client, receipt, amount);
  return updated;
}

/** Daraja's STK callback body. */
export interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] };
    };
  };
}

export async function handleStkCallback(company: string, token: string, body: StkCallbackBody) {
  const live = await liveMpesa(company);
  if (!live || !token || token !== live.webhookToken) return { accepted: false };
  const cb = body.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return { accepted: false };
  const meta = callbackMetadata(cb.CallbackMetadata?.Item);
  await settleStk(cb.CheckoutRequestID, {
    success: Number(cb.ResultCode) === 0,
    resultCode: Number(cb.ResultCode),
    resultDesc: cb.ResultDesc,
    receipt: meta.receipt,
    amount: meta.amount,
    phone: meta.phone,
  });
  return { accepted: true };
}

/**
 * Reads the state of an STK request. A live request that has been pending for
 * a while is checked with Safaricom directly, which covers deployments whose
 * callback URL isn't reachable yet.
 */
export async function stkStatus(id: string) {
  const db = await getDb();
  const [req] = await db.select().from(stkRequests).where(eq(stkRequests.id, id));
  if (!req) return null;

  const ageMs = Date.now() - req.createdAt.getTime();
  if (req.mode === "live" && req.status === "pending" && ageMs > 20_000) {
    const live = await liveMpesa(req.company);
    if (live) {
      try {
        const q = await stkQuery(live.config, req.id);
        const code = Number(q.ResultCode);
        // 4999 / missing: still being processed on the handset.
        if (!Number.isNaN(code) && code !== 4999) {
          return await settleStk(req.id, { success: code === 0, resultCode: code, resultDesc: q.ResultDesc });
        }
      } catch {
        /* still processing, or the query itself failed: keep waiting */
      }
    }
  }
  if (req.status === "pending" && ageMs > 3 * 60_000) {
    return settleStk(req.id, { success: false, resultCode: 1037, resultDesc: "No response from the phone in time." });
  }
  return req;
}

/* ---------------- Paybill (C2B) ---------------- */

export interface C2BInput {
  transId: string;
  amount: number;
  account: string;
  payer: string;
}

/** Matches a Paybill payment to a client by account number, or holds it in suspense. */
export async function ingestC2B(company: string, input: C2BInput) {
  const db = await getDb();
  const parsed = parseClientNumber(input.account);
  const [matched] = parsed.ok ? await db.select().from(clients).where(eq(clients.id, parsed.id)) : [];

  if (parsed.ok && matched && matched.company === company) {
    const posted = await postPayment(db, {
      receipt: input.transId,
      client: matched.id,
      amount: input.amount,
      channel: "Paybill",
      payer: input.payer,
      desc: "M-Pesa Paybill",
    });
    if (posted) await receiptSms(db, matched.id, input.transId, input.amount);
    const bal = await balanceOf(db, matched.id);
    return { ok: true, message: `Matched to ${matched.name}. New balance ${kes(bal)}.` };
  }

  const reason = !parsed.ok
    ? parsed.reason
    : !matched
      ? "No client with this number"
      : "Number belongs to another company";
  await db
    .insert(suspense)
    .values({
      id: input.transId,
      account: input.account,
      amount: Math.round(input.amount),
      payer: input.payer,
      date: nowStamp(),
      company,
      reason,
    })
    .onConflictDoNothing();
  return { ok: false, message: `Held in suspense: ${reason}.` };
}

export interface C2BConfirmationBody {
  TransID?: string;
  TransAmount?: string | number;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
}

export async function handleC2BConfirmation(company: string, token: string, body: C2BConfirmationBody) {
  const live = await liveMpesa(company);
  if (!live || !token || token !== live.webhookToken || !body.TransID) return { accepted: false };
  await ingestC2B(company, {
    transId: body.TransID,
    amount: Number(body.TransAmount ?? 0),
    account: String(body.BillRefNumber ?? ""),
    // Newer Daraja versions mask or hash the payer's number.
    payer: body.MSISDN && /^\d+$/.test(body.MSISDN) ? normalisePhone(body.MSISDN) : (body.FirstName ?? "M-Pesa customer"),
  });
  return { accepted: true };
}

/** Test button: sign in to Daraja with the saved keys. */
export async function testMpesa(company: string) {
  const cfg = await draftMpesa(company);
  if ("error" in cfg) return { ok: false, detail: cfg.error };
  try {
    const { accessToken } = await import("./integrations/daraja");
    await accessToken(cfg);
    return {
      ok: true,
      detail: `Signed in to Daraja ${cfg.environment}. STK Push is live for short code ${cfg.shortcode}.`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof DarajaError ? err.message : "Could not reach Safaricom." };
  }
}

/** Remembers when Paybill URLs were registered, for the go-live checklist. */
async function markRegistered(company: string) {
  const db = await getDb();
  await db
    .update(schema.settings)
    .set({
      config: sql`${schema.settings.config} || ${JSON.stringify({ c2bRegisteredAt: new Date().toISOString() })}::jsonb`,
    })
    .where(and(eq(schema.settings.scope, company), eq(schema.settings.key, "mpesa")));
}

/** Registers the Paybill confirmation URLs with Safaricom. */
export async function registerUrls(company: string, actor: { sub: string; name: string }) {
  const live = await liveMpesa(company);
  if (!live) return { ok: false, detail: "Test the M-Pesa keys successfully first." };
  const base = await publicBaseUrl();
  if (!base?.startsWith("https://")) return { ok: false, detail: "Set the public HTTPS address in Settings first." };
  try {
    const res = await registerC2B(
      live.config,
      `${base}/api/pay/c2b/${company}/${live.webhookToken}/confirm`,
      `${base}/api/pay/c2b/${company}/${live.webhookToken}/validate`,
    );
    await markRegistered(company);
    await audit(actor, { action: "mpesa.register_urls", company, detail: { result: res.ResponseDescription } });
    return { ok: true, detail: res.ResponseDescription || "URLs registered." };
  } catch (err) {
    return { ok: false, detail: err instanceof DarajaError ? err.message : "Could not reach Safaricom." };
  }
}

/**
 * The Paybill simulator. In sandbox with live keys it asks Safaricom to send a
 * real test payment to our URLs; otherwise it confirms one locally.
 */
export async function simulatePaybill(company: string, input: { account: string; amount: number; phone: string }) {
  const live = await liveMpesa(company);
  if (live && live.config.environment === "sandbox") {
    try {
      await simulateC2B(live.config, input);
      return {
        ok: true,
        receipt: "",
        message: "Sent to the Daraja sandbox. The payment appears here when Safaricom calls back.",
        mode: "live" as const,
      };
    } catch (err) {
      return {
        ok: false,
        receipt: "",
        message: err instanceof DarajaError ? err.message : "Could not reach Safaricom.",
        mode: "live" as const,
      };
    }
  }
  const receipt = receiptNumber();
  const res = await ingestC2B(company, {
    transId: receipt,
    amount: input.amount,
    account: input.account,
    payer: normalisePhone(input.phone),
  });
  return { ...res, receipt, mode: "simulated" as const };
}

