// Server-only. Loads, saves and describes integration settings.
import { and, eq } from "drizzle-orm";
import {
  DEFAULT_PRICES,
  DEFAULT_REMINDERS,
  integrationDef,
  type IntegrationKey,
  type IntegrationView,
} from "@/lib/integrations";
import { decryptSecret, encryptSecret, randomToken } from "./crypto";
import { getDb, schema } from "./db";

const { settings } = schema;

/** A setting with its secrets decrypted — server-side use only. */
export interface Resolved {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  status: "unconfigured" | "ok" | "error";
}

export async function loadSetting(scope: string, key: IntegrationKey): Promise<Resolved | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.scope, scope), eq(settings.key, key)));
  if (!row) return null;
  const secrets: Record<string, string> = {};
  for (const [name, value] of Object.entries(row.secrets)) {
    const plain = decryptSecret(value);
    if (plain !== null) secrets[name] = plain;
  }
  return { config: row.config, secrets, status: row.status as Resolved["status"] };
}

export async function loadAll(scope: string) {
  const db = await getDb();
  return db.select().from(settings).where(eq(settings.scope, scope));
}

/**
 * Saves one integration. Non-secret fields replace the stored config; a secret
 * is only replaced when a new value is typed (blank means "keep the saved one")
 * and removed when `clear` names it.
 */
export async function saveSetting(
  scope: string,
  key: IntegrationKey,
  input: { config: Record<string, unknown>; secrets: Record<string, string>; clear?: string[] },
  actor: string,
) {
  const def = integrationDef(key);
  if (!def) throw new Error(`Unknown integration ${key}`);

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.scope, scope), eq(settings.key, key)));

  const config: Record<string, unknown> = { ...(existing?.config ?? {}) };
  const stored: Record<string, string> = { ...(existing?.secrets ?? {}) };
  const changed: string[] = [];

  for (const field of def.fields) {
    if (field.type === "secret") {
      const typed = input.secrets[field.name]?.trim();
      if (typed) {
        stored[field.name] = encryptSecret(typed);
        changed.push(field.name);
      } else if (input.clear?.includes(field.name) && stored[field.name]) {
        delete stored[field.name];
        changed.push(field.name);
      }
      continue;
    }
    if (!(field.name in input.config)) continue;
    const raw = input.config[field.name];
    const value =
      field.type === "number"
        ? raw === "" || raw === null || raw === undefined
          ? null
          : Number(raw)
        : field.type === "toggle"
          ? Boolean(raw)
          : String(raw ?? "").trim();
    if (JSON.stringify(config[field.name]) !== JSON.stringify(value)) changed.push(field.name);
    config[field.name] = value;
  }

  // Callbacks from Safaricom and Africa's Talking carry no signature, so each
  // one is addressed with an unguessable token we can check on arrival.
  if ((key === "mpesa" || key === "ussd") && !config.webhookToken) config.webhookToken = randomToken();

  // Changing credentials invalidates the last test.
  const status = changed.length ? "unconfigured" : (existing?.status ?? "unconfigured");

  await db
    .insert(settings)
    .values({ scope, key, config, secrets: stored, status, updatedBy: actor, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [settings.scope, settings.key],
      set: {
        config,
        secrets: stored,
        status,
        statusDetail: changed.length ? null : existing?.statusDetail,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    });

  return { changed };
}

export async function setStatus(scope: string, key: IntegrationKey, ok: boolean, detail: string) {
  const db = await getDb();
  await db
    .insert(settings)
    .values({
      scope,
      key,
      status: ok ? "ok" : "error",
      statusDetail: detail,
      testedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [settings.scope, settings.key],
      set: { status: ok ? "ok" : "error", statusDetail: detail, testedAt: new Date() },
    });
}

/** The public base URL payments and USSD call back to. */
export async function publicBaseUrl(): Promise<string | null> {
  const app = await loadSetting("platform", "app");
  const url = String(app?.config.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return url || null;
}

/** Addresses the provider must be told about, for the settings screen. */
export async function callbacksFor(scope: string, key: IntegrationKey, config: Record<string, unknown>) {
  const base = (await publicBaseUrl()) ?? "https://<your-public-address>";
  const token = String(config.webhookToken ?? "");
  if (key === "mpesa" && token) {
    // Safaricom rejects registration URLs containing words like "mpesa" or
    // "safaricom", so these routes live under /api/pay.
    return [
      { label: "STK Push callback (set automatically)", url: `${base}/api/pay/stk/${scope}/${token}` },
      { label: "C2B confirmation URL", url: `${base}/api/pay/c2b/${scope}/${token}/confirm` },
      { label: "C2B validation URL", url: `${base}/api/pay/c2b/${scope}/${token}/validate` },
    ];
  }
  if (key === "ussd" && token) {
    return [{ label: "USSD callback URL", url: `${base}/api/ussd/${token}` }];
  }
  if (key === "sms") {
    return [{ label: "Delivery reports URL (optional)", url: `${base}/api/sms/delivery` }];
  }
  return undefined;
}

export async function viewOf(scope: string, key: IntegrationKey): Promise<IntegrationView> {
  const def = integrationDef(key)!;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.scope, scope), eq(settings.key, key)));

  const secrets: IntegrationView["secrets"] = {};
  for (const f of def.fields) {
    if (f.type !== "secret") continue;
    const stored = row?.secrets[f.name];
    const plain = stored ? decryptSecret(stored) : null;
    secrets[f.name] = { saved: plain !== null, hint: plain ? `…${plain.slice(-4)}` : undefined };
  }

  const config = { ...defaultsFor(key), ...(row?.config ?? {}) };
  return {
    key,
    scope,
    config,
    secrets,
    status: (row?.status as IntegrationView["status"]) ?? "unconfigured",
    statusDetail: row?.statusDetail ?? undefined,
    testedAt: row?.testedAt?.toISOString(),
    updatedAt: row?.updatedAt?.toISOString(),
    updatedBy: row?.updatedBy ?? undefined,
    callbacks: await callbacksFor(scope, key, config),
  };
}

export function defaultsFor(key: IntegrationKey): Record<string, unknown> {
  switch (key) {
    case "mpesa":
      return { environment: "sandbox", shortcodeType: "paybill" };
    case "reminders":
      return { ...DEFAULT_REMINDERS };
    case "pricing":
      return { ...DEFAULT_PRICES };
    case "sms":
      return { environment: "sandbox" };
    case "ai":
      return { model: "claude-opus-5" };
    case "ussd":
      return { enabled: false };
    default:
      return {};
  }
}

/** Company reminder policy with defaults filled in. */
export async function reminderPolicy(company: string) {
  const s = await loadSetting(company, "reminders");
  const c = { ...DEFAULT_REMINDERS, ...(s?.config ?? {}) } as typeof DEFAULT_REMINDERS;
  return {
    enabled: Boolean(c.enabled),
    smsAfterDays: Number(c.smsAfterDays ?? DEFAULT_REMINDERS.smsAfterDays),
    stkAfterDays: Number(c.stkAfterDays ?? DEFAULT_REMINDERS.stkAfterDays),
    warnAfterDays: Number(c.warnAfterDays ?? DEFAULT_REMINDERS.warnAfterDays),
    minBalance: Number(c.minBalance ?? DEFAULT_REMINDERS.minBalance),
  };
}

/** Company pickup prices with defaults filled in. */
export async function priceList(company: string): Promise<Record<string, number>> {
  const s = await loadSetting(company, "pricing");
  const out: Record<string, number> = { ...DEFAULT_PRICES };
  for (const [k, v] of Object.entries(s?.config ?? {})) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }
  return out;
}
