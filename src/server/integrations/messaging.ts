// Server-only. SMS (Africa's Talking) and email (Resend), with an outbox.
import { getDb, schema } from "../db";
import { loadSetting } from "../settings";

const AT = {
  sandbox: "https://api.sandbox.africastalking.com/version1",
  live: "https://api.africastalking.com/version1",
} as const;

interface SmsConfig {
  environment: "sandbox" | "live";
  username: string;
  apiKey: string;
  senderId?: string;
}

async function smsConfig(): Promise<SmsConfig | null> {
  const s = await loadSetting("platform", "sms");
  if (!s || s.status !== "ok" || !s.secrets.apiKey || !s.config.username) return null;
  return {
    environment: s.config.environment === "live" ? "live" : "sandbox",
    username: String(s.config.username),
    apiKey: s.secrets.apiKey,
    senderId: s.config.senderId ? String(s.config.senderId) : undefined,
  };
}

export const smsLive = async () => (await smsConfig()) !== null;

/** "0712 345 678" -> "+254712345678" */
export const e164 = (phone: string) => `+${phone.replace(/\D/g, "").replace(/^0/, "254")}`;

/**
 * Sends one SMS, or records it as "simulated" when no provider is configured.
 * Every message lands in the outbox either way, so admins can see what went out.
 */
export async function sendSms(input: { to: string; body: string; purpose: string; company?: string | null }) {
  const db = await getDb();
  const cfg = await smsConfig();

  let status: "sent" | "simulated" | "failed" = "simulated";
  let providerId: string | null = null;
  let error: string | null = null;

  if (cfg) {
    try {
      const form = new URLSearchParams({ username: cfg.username, to: e164(input.to), message: input.body });
      if (cfg.senderId) form.set("from", cfg.senderId);
      const res = await fetch(`${AT[cfg.environment]}/messaging`, {
        method: "POST",
        headers: {
          apiKey: cfg.apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        SMSMessageData?: { Message?: string; Recipients?: { statusCode: number; status: string; messageId: string }[] };
      };
      const r = json.SMSMessageData?.Recipients?.[0];
      if (res.ok && r && (r.statusCode === 100 || r.statusCode === 101 || r.statusCode === 102)) {
        status = "sent";
        providerId = r.messageId;
      } else {
        status = "failed";
        error = r?.status ?? json.SMSMessageData?.Message ?? `HTTP ${res.status}`;
      }
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : String(err);
    }
  }

  await db.insert(schema.smsOutbox).values({
    company: input.company ?? null,
    to: input.to,
    body: input.body,
    purpose: input.purpose,
    status,
    providerId,
    error,
  });
  return { status, error };
}

/** Checks the credentials by reading the account balance. */
export async function testSms(cfg: { environment: string; username: string; apiKey: string }) {
  const env = cfg.environment === "live" ? "live" : "sandbox";
  const res = await fetch(`${AT[env]}/user?username=${encodeURIComponent(cfg.username)}`, {
    headers: { apiKey: cfg.apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) return { ok: false, detail: "Africa's Talking rejected the username or API key." };
  if (!res.ok) return { ok: false, detail: `Africa's Talking returned HTTP ${res.status}.` };
  const json = (await res.json().catch(() => ({}))) as { UserData?: { balance?: string } };
  return { ok: true, detail: `Connected. Balance ${json.UserData?.balance ?? "unknown"}.` };
}

/* ---------------- email ---------------- */

async function emailConfig() {
  const s = await loadSetting("platform", "email");
  if (!s || s.status !== "ok" || !s.secrets.apiKey || !s.config.from) return null;
  return { apiKey: s.secrets.apiKey, from: String(s.config.from) };
}

export const emailLive = async () => (await emailConfig()) !== null;

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const cfg = await emailConfig();
  if (!cfg) return { status: "simulated" as const };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    return { status: "failed" as const, error: `Resend returned HTTP ${res.status}: ${body.slice(0, 160)}` };
  }
  return { status: "sent" as const };
}

export async function testEmail(apiKey: string) {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { ok: true, detail: "Connected to Resend." };
  const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
  // A sending-only key can't list domains, but it is a valid key.
  if (body.name === "restricted_api_key") return { ok: true, detail: "Connected (sending-only key)." };
  if (res.status === 401 || res.status === 403) return { ok: false, detail: "Resend rejected the API key." };
  return { ok: false, detail: body.message ?? `Resend returned HTTP ${res.status}.` };
}
