// Server-only. Built-in roles for older databases, and each company's starting departments.
import { sql } from "drizzle-orm";
import { DEFAULT_ROLES } from "@/lib/auth/defaultRoles";
import { COMPANIES } from "@/lib/reference/companies";
import { hashPassword } from "../password";
import { nowStamp } from "../time";
import type { Db } from "./index";
import * as t from "./schema";

const DEMO_PASSWORD = "zoa12345";

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

/** Roles added in later releases, so a database seeded earlier still has them. */
export async function ensureSystemRoles(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.roles);
  if (n === 0) return; // an empty database gets every role from the main seed
  await db
    .insert(t.roles)
    .values(DEFAULT_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })))
    .onConflictDoNothing();
}

export async function seedTeamIfEmpty(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.departments);
  if (n > 0) return;
  const [{ roles }] = await db.select({ roles: sql<number>`count(*)::int` }).from(t.roles);
  if (roles === 0) return;

  const createdAt = nowStamp();
  const ids: Record<string, string> = {};
  for (const co of COMPANIES) {
    await db.insert(t.departments).values(
      DEPARTMENTS.map((d) => {
        const id = `dep-${co.id.toLowerCase()}-${d.key}`;
        ids[`${co.id}:${d.key}`] = id;
        return { id, company: co.id, name: d.name, description: d.description, permissions: d.permissions, createdAt };
      }),
    );
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
