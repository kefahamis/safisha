/*
 * How long the audit log keeps each kind of entry. The platform admin sets a
 * number of days per category; the nightly maintenance job removes anything
 * older. Categories are matched on the action name's prefix, first match wins,
 * and anything unmatched is "other".
 */

export type AuditCategory = "signin" | "access" | "money" | "system" | "other";

export interface AuditCategoryDef {
  key: AuditCategory;
  /** The setting field holding this category's days. */
  field: string;
  label: string;
  detail: string;
  defaultDays: number;
  /** Action names, or prefixes ending in "." */
  match: string[];
}

export const AUDIT_CATEGORIES: AuditCategoryDef[] = [
  {
    key: "signin",
    field: "signinDays",
    label: "Sign-ins",
    detail: "Staff signing in, and accepting invitations.",
    defaultDays: 90,
    match: ["user.signin", "user.invite.accept"],
  },
  {
    key: "money",
    field: "moneyDays",
    label: "Money",
    detail: "Payments, invoices, journals, billing runs, reminders and care packages.",
    // KRA expects business records to be kept for five years.
    defaultDays: 1825,
    match: ["payment.", "invoice.", "journal.", "billing.", "reminders.", "package.", "client.create"],
  },
  {
    key: "access",
    field: "accessDays",
    label: "Access & settings",
    detail: "Roles, users, staff, departments, profiles, two-step sign-in, settings, branding and companies.",
    defaultDays: 730,
    match: [
      "role.",
      "user.",
      "staff.",
      "department.",
      "profile.",
      "security.",
      "settings.save",
      "mpesa.",
      "branding.",
      "company.",
      "estate.",
      "backup.download",
    ],
  },
  {
    key: "system",
    field: "systemDays",
    label: "Housekeeping",
    detail: "Nightly maintenance, backups and connection tests.",
    defaultDays: 30,
    match: ["maintenance.", "backup.run", "settings.test.", "settings.send-test.", "audit.purge"],
  },
  {
    key: "other",
    field: "otherDays",
    label: "Everything else",
    detail: "Fleet, dumping reports and anything not listed above.",
    defaultDays: 365,
    match: [],
  },
];

/** Entries are kept at least this long, whatever is set. */
export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;

/** Which category an action belongs to. */
export function auditCategory(action: string): AuditCategory {
  for (const c of AUDIT_CATEGORIES) {
    if (c.match.some((m) => (m.endsWith(".") ? action.startsWith(m) : action === m))) return c.key;
  }
  return "other";
}

export interface RetentionPolicy {
  enabled: boolean;
  days: Record<AuditCategory, number>;
}

/** A policy from saved settings, with defaults filled in and every value clamped to the allowed range. */
export function retentionPolicy(config: Record<string, unknown> | undefined): RetentionPolicy {
  const days = {} as Record<AuditCategory, number>;
  for (const c of AUDIT_CATEGORIES) {
    const raw = Number(config?.[c.field]);
    days[c.key] = Number.isFinite(raw) && raw > 0
      ? Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(raw)))
      : c.defaultDays;
  }
  return { enabled: config?.enabled === true, days };
}

/** What the next clean-up would remove, per category. */
export interface RetentionPreview {
  policy: RetentionPolicy;
  categories: { key: AuditCategory; days: number; due: number; total: number }[];
}
