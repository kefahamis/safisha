// Server-only. Who changed what, for the audit log.
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

export async function audit(actor: Actor, entry: AuditEntry) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    actor: actor.sub,
    actorName: actor.name,
    company: entry.company ?? actor.scope?.companyId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    detail: entry.detail ?? {},
  });
}

/** For events raised by the platform itself: callbacks, scheduled jobs. */
export const SYSTEM_ACTOR = { sub: "system", name: "System" } as const;
