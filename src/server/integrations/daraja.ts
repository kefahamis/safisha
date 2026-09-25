// Server-only. Safaricom Daraja: OAuth, STK Push, STK query and C2B URLs.
import { darajaTimestamp } from "../time";

export interface DarajaConfig {
  environment: "sandbox" | "production";
  shortcodeType: "paybill" | "till";
  shortcode: string;
  tillNumber?: string;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
}

export class DarajaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const BASE = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

const base = (c: DarajaConfig) => BASE[c.environment] ?? BASE.sandbox;

/** Access tokens last an hour; reuse them until a minute before expiry. */
const tokens = new Map<string, { token: string; expires: number }>();

export async function accessToken(c: DarajaConfig): Promise<string> {
  const cacheKey = `${c.environment}:${c.consumerKey}`;
  const hit = tokens.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.token;

  const auth = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const res = await fetch(`${base(c)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DarajaError(
      res.status === 400 || res.status === 401
        ? "Safaricom rejected the consumer key or secret."
        : `Safaricom returned HTTP ${res.status} when signing in.`,
      res.status,
    );
  }
  const body = JSON.parse(text) as { access_token?: string; expires_in?: string };
  if (!body.access_token) throw new DarajaError("Safaricom did not return an access token.");
  tokens.set(cacheKey, {
    token: body.access_token,
    expires: Date.now() + (Number(body.expires_in ?? 3599) - 60) * 1000,
  });
  return body.access_token;
}

async function post<T>(c: DarajaConfig, path: string, body: unknown): Promise<T> {
  const token = await accessToken(c);
  const res = await fetch(`${base(c)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || json.errorCode) {
    throw new DarajaError(
      String(json.errorMessage ?? json.ResponseDescription ?? `Safaricom returned HTTP ${res.status}.`),
      res.status,
      json.errorCode ? String(json.errorCode) : undefined,
    );
  }
  return json as T;
}

/** "0712 345 678" / "+254712345678" -> "254712345678" */
export function msisdn(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "254").replace(/^(\d{9})$/, "254$1");
}

function password(c: DarajaConfig, timestamp: string) {
  return Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
}

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/** Lipa na M-Pesa Online: sends the PIN prompt to the customer's phone. */
export function stkPush(
  c: DarajaConfig,
  input: { phone: string; amount: number; account: string; description: string; callbackUrl: string },
) {
  const timestamp = darajaTimestamp();
  const till = c.shortcodeType === "till";
  return post<StkPushResult>(c, "/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: c.shortcode,
    Password: password(c, timestamp),
    Timestamp: timestamp,
    TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: Math.round(input.amount),
    PartyA: msisdn(input.phone),
    PartyB: till ? c.tillNumber || c.shortcode : c.shortcode,
    PhoneNumber: msisdn(input.phone),
    CallBackURL: input.callbackUrl,
    // Daraja caps these at 12 and 13 characters.
    AccountReference: input.account.slice(0, 12),
    TransactionDesc: input.description.slice(0, 13),
  });
}

/** Asks Safaricom how an STK Push ended — for when the callback can't reach us. */
export function stkQuery(c: DarajaConfig, checkoutRequestId: string) {
  const timestamp = darajaTimestamp();
  return post<{ ResultCode: string; ResultDesc: string; ResponseCode?: string }>(
    c,
    "/mpesa/stkpushquery/v1/query",
    {
      BusinessShortCode: c.shortcode,
      Password: password(c, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
  );
}

/** Tells Safaricom where to send Paybill confirmations for this short code. */
export function registerC2B(c: DarajaConfig, confirmationUrl: string, validationUrl: string) {
  return post<{ ResponseDescription: string }>(c, "/mpesa/c2b/v1/registerurl", {
    ShortCode: c.shortcodeType === "till" ? c.tillNumber || c.shortcode : c.shortcode,
    ResponseType: "Completed",
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl,
  });
}

/** Sandbox only: makes Safaricom send a test Paybill payment to our URLs. */
export function simulateC2B(c: DarajaConfig, input: { amount: number; account: string; phone: string }) {
  return post<{ ResponseDescription: string }>(c, "/mpesa/c2b/v1/simulate", {
    ShortCode: c.shortcode,
    CommandID: c.shortcodeType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: Math.round(input.amount),
    Msisdn: msisdn(input.phone),
    BillRefNumber: input.account,
  });
}

/** STK callback item list -> a flat object. */
export function callbackMetadata(items: { Name: string; Value?: string | number }[] = []) {
  const get = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    amount: Number(get("Amount") ?? 0),
    receipt: get("MpesaReceiptNumber") ? String(get("MpesaReceiptNumber")) : undefined,
    phone: get("PhoneNumber") ? String(get("PhoneNumber")) : undefined,
    date: get("TransactionDate") ? String(get("TransactionDate")) : undefined,
  };
}
