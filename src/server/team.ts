// Server-only. A company's own staff and departments, run by its company admin.
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { COMPANY_ASSIGNABLE } from "@/lib/auth/permissions";
import type { Session, Workspace } from "@/lib/auth/types";
import type { StaffMember, TeamBundle } from "@/lib/team";
import { findUserById, updateUser } from "./accessStore";
import { audit } from "./audit";
import { createInvite } from "./authFlows";
import { randomToken } from "./crypto";
import { getDb, schema } from "./db";
import { HttpError } from "./session";
import { visibleCompanies } from "./snapshot";
import { nowStamp } from "./time";

const t = schema;

/** The role every invited staff member holds; their department supplies the rest. */
export const STAFF_ROLE = "company_staff";

/** Throws unless the session may manage this company's staff. */
export async function requireTeam(session: Session, company: string) {
  if (!session.permissions.includes("staff.manage")) throw new HttpError(403, "Missing permission: staff.manage");
  const companies = await visibleCompanies(session);
  if (companies !== null && !companies.includes(company)) throw new HttpError(403, "That belongs to another company.");
}

export const assignableFor = (session: Session) => COMPANY_ASSIGNABLE.filter((p) => session.permissions.includes(p));

/**
 * Keep what the admin can't see untouched: permissions outside their pool that
 * are already there (set by the platform admin) stay, the rest follow the input.
 */
const merge = (existing: string[], input: string[], pool: string[]) => [
  ...new Set([...existing.filter((p) => !pool.includes(p)), ...input.filter((p) => pool.includes(p))]),
];

export async function teamBundle(session: Session, company: string): Promise<TeamBundle> {
  const db = await getDb();
  const [deptRows, userRows, roleRows] = await Promise.all([
    db.select().from(t.departments).where(eq(t.departments.company, company)).orderBy(t.departments.name),
    db.select().from(t.users).where(sql`${t.users.scope}->>'companyId' = ${company}`),
    db.select().from(t.roles),
  ]);
  const roleOf = new Map(roleRows.map((r) => [r.id, r]));
  const staff: StaffMember[] = userRows
    .filter((u) => {
      const ws = roleOf.get(u.roleId)?.workspace;
      return ws === "company" || ws === "collector";
    })
    .map((u) => {
      const role = roleOf.get(u.roleId);
      const workspace = (role?.workspace ?? "company") as Workspace;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? undefined,
        roleId: u.roleId,
        roleName: role?.name ?? u.roleId,
        rolePermissions: role?.permissions ?? [],
        workspace,
        departmentId: u.scope.departmentId,
        truckId: u.scope.truckId,
        grants: u.grants,
        denies: u.denies,
        suspended: u.suspended,
        lastLoginAt: u.lastLoginAt ?? undefined,
        createdAt: u.createdAt,
        editable: workspace === "company" && !role?.permissions.includes("staff.manage") && u.id !== session.sub,
      };
    })
    .sort((a, b) => Number(b.workspace === "company") - Number(a.workspace === "company") || a.name.localeCompare(b.name));

  return {
    company,
    departments: deptRows.map((d) => ({
      ...d,
      permissions: [...d.permissions],
      members: staff.filter((s) => s.departmentId === d.id).length,
    })),
    staff,
    assignable: assignableFor(session),
  };
}

/* ---------------- departments ---------------- */

export const DepartmentBody = z.object({
  name: z.string().max(60),
  description: z.string().max(200).default(""),
  permissions: z.array(z.string()).max(100),
});

export type DepartmentInput = z.infer<typeof DepartmentBody>;

async function getDepartment(company: string, id: string) {
  const db = await getDb();
  const [d] = await db.select().from(t.departments).where(eq(t.departments.id, id));
  if (!d || d.company !== company) throw new HttpError(404, "No such department.");
  return d;
}

export async function saveDepartment(session: Session, company: string, input: DepartmentInput, id?: string) {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new HttpError(400, "Give the department a name.");
  const db = await getDb();
  const existing = id ? await getDepartment(company, id) : null;
  const clash = await db.select({ id: t.departments.id }).from(t.departments).where(
    sql`${t.departments.company} = ${company} and lower(${t.departments.name}) = ${name.toLowerCase()}`,
  );
  if (clash.some((c) => c.id !== id)) throw new HttpError(409, "There's already a department with that name.");

  const pool = assignableFor(session);
  const permissions = merge(existing?.permissions ?? [], input.permissions.map(String), pool);
  const description = input.description.trim().slice(0, 200);

  if (existing) {
    await db.update(t.departments).set({ name, description, permissions }).where(eq(t.departments.id, existing.id));
  } else {
    id = `dep-${randomToken(6)}`;
    await db.insert(t.departments).values({ id, company, name, description, permissions, createdAt: nowStamp() });
  }
  await audit(session, {
    action: existing ? "department.update" : "department.create",
    target: name,
    company,
    detail: { permissions },
  });
  return id!;
}

export async function deleteDepartment(session: Session, company: string, id: string) {
  const d = await getDepartment(company, id);
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.users)
    .where(sql`${t.users.scope}->>'departmentId' = ${id}`);
  if (n > 0) throw new HttpError(409, `Move its ${n} member${n === 1 ? "" : "s"} to another department first.`);
  await db.delete(t.departments).where(eq(t.departments.id, id));
  await audit(session, { action: "department.delete", target: d.name, company });
}

/* ---------------- staff ---------------- */

export async function inviteStaff(
  session: Session,
  company: string,
  input: { name: string; email: string; phone?: string; departmentId: string },
) {
  await getDepartment(company, input.departmentId);
  const res = await createInvite(
    {
      email: input.email,
      name: input.name,
      phone: input.phone,
      roleId: STAFF_ROLE,
      scope: { companyId: company, departmentId: input.departmentId },
    },
    session.name,
  );
  if (!res.ok) throw new HttpError(400, res.error);
  await audit(session, {
    action: "staff.invite",
    target: input.email.trim().toLowerCase(),
    company,
    detail: { department: input.departmentId, emailed: res.emailed },
  });
  return res;
}

export interface StaffPatch {
  departmentId?: string;
  grants?: string[];
  denies?: string[];
  suspended?: boolean;
}

export async function updateStaff(session: Session, company: string, userId: string, patch: StaffPatch) {
  const user = await findUserById(userId);
  if (!user || user.scope.companyId !== company) throw new HttpError(404, "No such staff member.");
  if (user.id === session.sub) throw new HttpError(400, "You can't change your own access.");
  const db = await getDb();
  const [role] = await db.select().from(t.roles).where(eq(t.roles.id, user.roleId));
  if (role?.workspace !== "company") throw new HttpError(400, "Drivers are managed from Fleet management.");
  if (role.permissions.includes("staff.manage")) throw new HttpError(400, "Company admins are managed by the platform admin.");

  const pool = assignableFor(session);
  if (patch.departmentId !== undefined) {
    if (patch.departmentId) await getDepartment(company, patch.departmentId);
    const scope = { ...user.scope };
    if (patch.departmentId) scope.departmentId = patch.departmentId;
    else delete scope.departmentId;
    await db.update(t.users).set({ scope }).where(eq(t.users.id, user.id));
  }
  if (patch.grants !== undefined || patch.denies !== undefined || patch.suspended !== undefined) {
    const result = await updateUser(user.id, {
      grants: patch.grants === undefined ? undefined : merge(user.grants, patch.grants.map(String), pool),
      denies: patch.denies === undefined ? undefined : merge(user.denies, patch.denies.map(String), pool),
      suspended: patch.suspended,
    });
    if ("error" in result) throw new HttpError(400, result.error);
  }
  await audit(session, { action: "staff.update", target: user.name, company, detail: { ...patch } });
}
