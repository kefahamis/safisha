// Server-only. Who changed what, for the audit log.
import { headers } from "next/headers";
import type { Session } from "@/lib/auth/types";
import { getDb, schema } from "./db";

export interface AuditEntry {
  action: string;
  target?: string;
  company?: string | null;
  /** Never put secret values here — describe what changed, not the new value. */
  detail?: Record<string, unknown>;
}

type Actor = Pick<Session, "sub" | "name" | "scope"> | { sub: string; name: string; scope?: undefined };

/**
 * The caller's address; outside a request (a script, a job) there is none.
 * Netlify's own header comes first: Netlify sets it, so a caller can't forge
 * it, which matters because rate limits count per address. The first hop of
 * x-forwarded-for is the fallback behind other proxies.
 */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = h.get("x-nf-client-connection-ip") || forwarded || h.get("x-real-ip") || h.get("cf-connecting-ip");
    if (!ip) return null;
    // IPv4 carried in IPv6 form, as local servers report it.
    return ip.replace(/^::ffff:/, "").slice(0, 64);
  } catch {
    return null;
  }
}

export async function audit(actor: Actor, entry: AuditEntry) {
  const db = await getDb();
  const ip = await requestIp();
  await db.insert(schema.auditLog).values({
    actor: actor.sub,
    actorName: actor.name,
    company: entry.company ?? actor.scope?.companyId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    detail: entry.detail ?? {},
    ip,
  });
}

/** For events raised by the platform itself: callbacks, scheduled jobs. */
export const SYSTEM_ACTOR = { sub: "system", name: "System" } as const;
