// Server-only. Roles and user accounts, stored in the database.
import { eq, sql } from "drizzle-orm";
import { isPermissionId } from "@/lib/auth/permissions";
import type { PublicUser, RoleDef, User, Workspace } from "@/lib/auth/types";
import { getDb, schema } from "./db";

export { DEMO_PASSWORD } from "./db/seed";

const { roles, users } = schema;

const toRole = (r: typeof roles.$inferSelect): RoleDef => ({
  id: r.id,
  name: r.name,
  description: r.description,
  workspace: r.workspace as Workspace,
  permissions: [...r.permissions],
  system: r.system,
});

const toUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  email: u.email,
  phone: u.phone ?? undefined,
  name: u.name,
  roleId: u.roleId,
  scope: u.scope,
  grants: u.grants,
  denies: u.denies,
  suspended: u.suspended,
  passwordHash: u.passwordHash,
  lang: u.lang,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt ?? undefined,
});

/* ---------------- roles ---------------- */

export async function listRoles(): Promise<RoleDef[]> {
  const db = await getDb();
  return (await db.select().from(roles).orderBy(roles.system, roles.name)).map(toRole).sort(
    (a, b) => Number(b.system) - Number(a.system),
  );
}

export async function findRole(id: string): Promise<RoleDef | undefined> {
  const db = await getDb();
  const [r] = await db.select().from(roles).where(eq(roles.id, id));
  return r ? toRole(r) : undefined;
}

export async function setRolePermissions(roleId: string, permissions: string[]): Promise<RoleDef | null> {
  const db = await getDb();
  // Never trust the wire: keep only ids that exist in the catalogue.
  const clean = [...new Set(permissions.filter(isPermissionId))];
  const [r] = await db.update(roles).set({ permissions: clean }).where(eq(roles.id, roleId)).returning();
  return r ? toRole(r) : null;
}

export async function createRole(input: {
  name: string;
  description: string;
  workspace: Workspace;
  permissions: string[];
}): Promise<RoleDef | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the role a name." };

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!id) return { error: "Give the role a name using letters or numbers." };
  if (await findRole(id)) return { error: "A role with that name exists." };

  const db = await getDb();
  const [r] = await db
    .insert(roles)
    .values({
      id,
      name,
      description: input.description.trim(),
      workspace: input.workspace,
      system: false,
      permissions: [...new Set(input.permissions.filter(isPermissionId))],
    })
    .returning();
  return toRole(r);
}

export async function deleteRole(roleId: string): Promise<{ ok: true } | { error: string }> {
  const role = await findRole(roleId);
  if (!role) return { error: "No such role." };
  if (role.system) return { error: "Built-in roles cannot be deleted." };

  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.roleId, roleId));
  if (n > 0) return { error: `${n} user${n === 1 ? "" : "s"} still hold this role.` };

  await db.delete(roles).where(eq(roles.id, roleId));
  return { ok: true };
}

/* ---------------- users ---------------- */

export const toPublicUser = ({ passwordHash: _hash, ...rest }: User): PublicUser => rest;

export async function listUsers(): Promise<PublicUser[]> {
  const db = await getDb();
  return (await db.select().from(users).orderBy(users.createdAt, users.name)).map((u) =>
    toPublicUser(toUser(u)),
  );
}

export async function findUserById(id: string): Promise<User | undefined> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ? toUser(u) : undefined;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
  return u ? toUser(u) : undefined;
}

/** Phone numbers are stored "0712 345 678"; match on digits only. */
export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const digits = phone.replace(/\D/g, "").replace(/^254/, "0");
  const db = await getDb();
  const [u] = await db
    .select()
    .from(users)
    .where(sql`regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g') = ${digits}`);
  return u ? toUser(u) : undefined;
}

export async function recordLogin(userId: string, at: string) {
  const db = await getDb();
  await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
}

export async function setPassword(userId: string, passwordHash: string) {
  const db = await getDb();
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function setUserLang(userId: string, lang: string) {
  const db = await getDb();
  await db.update(users).set({ lang }).where(eq(users.id, userId));
}

export interface UserPatch {
  roleId?: string;
  grants?: string[];
  denies?: string[];
  suspended?: boolean;
}

export async function updateUser(userId: string, patch: UserPatch): Promise<PublicUser | { error: string }> {
  if (!(await findUserById(userId))) return { error: "No such user." };
  if (patch.roleId !== undefined && !(await findRole(patch.roleId))) return { error: "No such role." };

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.roleId !== undefined) set.roleId = patch.roleId;
  if (patch.grants !== undefined) set.grants = [...new Set(patch.grants.filter(isPermissionId))];
  if (patch.denies !== undefined) set.denies = [...new Set(patch.denies.filter(isPermissionId))];
  if (patch.suspended !== undefined) set.suspended = patch.suspended;

  const db = await getDb();
  const [u] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
  return toPublicUser(toUser(u));
}

export async function createUser(input: {
  id: string;
  email: string;
  phone?: string | null;
  name: string;
  roleId: string;
  scope: User["scope"];
  passwordHash: string;
  createdAt: string;
}): Promise<User> {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ ...input, phone: input.phone ?? null, grants: [], denies: [], suspended: false })
    .returning();
  return toUser(u);
}

/**
 * Effective permissions: the role's set, plus personal grants, minus personal
 * denies. Deny always wins — that is what makes an override a safe way to pull
 * one capability from one person without forking the role.
 */
export async function effectivePermissions(
  user: Pick<User, "roleId" | "grants" | "denies">,
  role?: RoleDef,
): Promise<string[]> {
  const r = role ?? (await findRole(user.roleId));
  const set = new Set(r ? r.permissions : []);
  for (const g of user.grants) set.add(g);
  for (const d of user.denies) set.delete(d);
  return [...set].sort();
}

/** How many people would be affected by editing a role. */
export async function roleUsage(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ roleId: users.roleId, n: sql<number>`count(*)::int` })
    .from(users)
    .groupBy(users.roleId);
  return Object.fromEntries(rows.map((r) => [r.roleId, r.n]));
}
