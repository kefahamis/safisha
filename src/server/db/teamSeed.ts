// Server-only. The built-in roles, each company's starting departments, and the demo staff.
import { sql } from "drizzle-orm";
import { DEFAULT_ROLES } from "@/lib/auth/defaultRoles";
import { COMPANIES } from "@/lib/reference/companies";
import { hashPassword } from "../password";
import { nowStamp } from "../time";
import { DEMO_PASSWORD } from "./demoPassword";
import type { Db } from "./index";
import * as t from "./schema";

/** The starting departments every company gets; admins rename, reshape or add to them. */
const DEPARTMENTS: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: "care",
    name: "Customer care",
    description: "Answers clients on the care desk and looks up their accounts.",
    permissions: ["clients.view", "statements.view", "payments.view", "tickets.view.company", "tickets.reply", "tickets.status", "tickets.translate"],
  },
  {
    key: "finance",
    name: "Finance & billing",
    description: "Matches M-Pesa payments, chases arrears and keeps the books.",
    permissions: ["clients.view", "statements.view", "payments.view", "payments.reconcile", "reminders.manage", "finance.view", "finance.journal"],
  },
  {
    key: "ops",
    name: "Operations",
    description: "Schedules pickups, clears dumping reports and watches the trucks.",
    permissions: ["clients.view", "fleet.view", "pickups.manage", "dumping.manage"],
  },
  {
    key: "fleet",
    name: "Fleet & workshop",
    description: "Keeps the trucks legal, serviced and fuelled.",
    permissions: ["fleet.view", "fleet.manage"],
  },
];

/** The built-in roles, including any added in later releases. Every database needs them. */
export async function ensureSystemRoles(db: Db) {
  await db
    .insert(t.roles)
    .values(DEFAULT_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })))
    .onConflictDoNothing();
}

/** A newly onboarded company's departments, ready for its admin to reshape. */
export async function createStarterDepartments(db: Db, company: string) {
  const createdAt = nowStamp();
  const ids: Record<string, string> = {};
  await db
    .insert(t.departments)
    .values(
      DEPARTMENTS.map((d) => {
        const id = `dep-${company.toLowerCase()}-${d.key}`;
        ids[d.key] = id;
        return { id, company, name: d.name, description: d.description, permissions: d.permissions, createdAt };
      }),
    )
    .onConflictDoNothing();
  return ids;
}

/** Demo only: departments for the demo companies, and two staff to show them at work. */
export async function seedTeamIfEmpty(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.departments);
  if (n > 0) return;
  const [{ roles }] = await db.select({ roles: sql<number>`count(*)::int` }).from(t.roles);
  if (roles === 0) return;

  const ids: Record<string, string> = {};
  for (const co of COMPANIES) {
    const made = await createStarterDepartments(db, co.id);
    for (const [key, id] of Object.entries(made)) ids[`${co.id}:${key}`] = id;
  }

  // Care agents join the care desk; two new faces show departments at work.
  await db.execute(sql`
    update ${t.users}
    set scope = scope || jsonb_build_object('departmentId', 'dep-' || lower(scope->>'companyId') || '-care')
    where role_id = 'company_agent' and scope ? 'companyId' and not scope ? 'departmentId'`);

  const hash = hashPassword(DEMO_PASSWORD);
  await db
    .insert(t.users)
    .values([
      {
        id: "u-ts-finance",
        email: "accounts@takasafi.co.ke",
        name: "Grace Wanjiru",
        roleId: "company_staff",
        scope: { companyId: "TS", departmentId: ids["TS:finance"] },
        grants: [],
        denies: [],
        passwordHash: hash,
        createdAt: "2026-09-01 09:00",
      },
      {
        id: "u-ts-workshop",
        email: "workshop@takasafi.co.ke",
        name: "Peter Oduor",
        roleId: "company_staff",
        scope: { companyId: "TS", departmentId: ids["TS:fleet"] },
        grants: [],
        denies: [],
        passwordHash: hash,
        createdAt: "2026-09-01 09:00",
      },
    ])
    .onConflictDoNothing();
}
