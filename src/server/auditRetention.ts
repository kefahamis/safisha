// Server-only. Ages out old audit-log entries according to the platform's retention settings.
import { and, lt, not, or, sql, type SQL } from "drizzle-orm";
import {
  AUDIT_CATEGORIES,
  retentionPolicy,
  type AuditCategory,
  type RetentionPolicy,
  type RetentionPreview,
} from "@/lib/auditRetention";
import { getDb, schema } from "./db";
import { loadSetting } from "./settings";

const a = schema.auditLog;

export async function auditRetentionPolicy(): Promise<RetentionPolicy> {
  const s = await loadSetting("platform", "auditRetention");
  return retentionPolicy(s?.config);
}

/** The SQL that picks out one category's entries, mirroring auditCategory(). */
function inCategory(key: AuditCategory): SQL {
  const matches = (c: (typeof AUDIT_CATEGORIES)[number]) =>
    or(...c.match.map((m) => (m.endsWith(".") ? sql`${a.action} like ${`${m.replace(/[%_]/g, "\\$&")}%`}` : sql`${a.action} = ${m}`)))!;
  const index = AUDIT_CATEGORIES.findIndex((c) => c.key === key);
  const earlier = AUDIT_CATEGORIES.slice(0, index).filter((c) => c.match.length);
  const own = AUDIT_CATEGORIES[index];
  // First match wins, so an entry belongs here only if no earlier category claims it.
  const notEarlier = earlier.map((c) => not(matches(c)));
  return own.match.length ? and(matches(own), ...notEarlier)! : and(...notEarlier)!;
}

const olderThan = (days: number) => lt(a.at, sql`now() - make_interval(days => ${days})`);

/** What the next clean-up would remove, for the settings screen. */
export async function retentionPreview(): Promise<RetentionPreview> {
  const policy = await auditRetentionPolicy();
  const db = await getDb();
  const categories: RetentionPreview["categories"] = [];
  for (const c of AUDIT_CATEGORIES) {
    const where = inCategory(c.key);
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${olderThan(policy.days[c.key])})::int`,
      })
      .from(a)
      .where(where);
    categories.push({ key: c.key, days: policy.days[c.key], due: row?.due ?? 0, total: row?.total ?? 0 });
  }
  return { policy, categories };
}

/**
 * Deletes entries older than their category's limit. Does nothing unless the
 * platform has turned retention on, or `force` is set by an admin running it by hand.
 */
export async function purgeAuditLog(opts: { force?: boolean } = {}) {
  const policy = await auditRetentionPolicy();
  if (!policy.enabled && !opts.force) return { skipped: "Audit log retention is off." };
  const db = await getDb();
  const removed: Partial<Record<AuditCategory, number>> = {};
  for (const c of AUDIT_CATEGORIES) {
    const rows = await db
      .delete(a)
      .where(and(inCategory(c.key), olderThan(policy.days[c.key])))
      .returning({ id: a.id });
    if (rows.length) removed[c.key] = rows.length;
  }
  return { removed, days: policy.days };
}
