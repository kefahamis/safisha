// Server-only. Holds roles and user accounts for the prototype.
import { DEFAULT_ROLES } from "@/lib/auth/defaultRoles";
import { isPermissionId } from "@/lib/auth/permissions";
import type { PublicUser, RoleDef, User, UserScope, Workspace } from "@/lib/auth/types";
import { createInitialState } from "@/lib/seed";
import { hashPassword } from "./password";

/**
 * In-memory, process-local. There is no database in this prototype, so accounts
 * and role edits live for the lifetime of the server process. Kept on
 * globalThis so the dev server's hot reload doesn't sign everyone out.
 */
interface AccessStore {
  roles: RoleDef[];
  users: User[];
}

const GLOBAL_KEY = Symbol.for("safisha.accessStore");
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: AccessStore };

/** Every demo account shares this password; it is printed on the sign-in page. */
export const DEMO_PASSWORD = "safisha123";

function seedStore(): AccessStore {
  const demo = createInitialState();
  const hash = hashPassword(DEMO_PASSWORD);
  const createdAt = "2026-09-01 09:00";

  const user = (
    id: string,
    email: string,
    name: string,
    roleId: string,
    scope: UserScope,
  ): User => ({
    id,
    email,
    name,
    roleId,
    scope,
    grants: [],
    denies: [],
    suspended: false,
    passwordHash: hash,
    createdAt,
  });

  const wanjiku = demo.clients[0];
  const brian = demo.clients[1];
  const grace = demo.clients.find((c) => c.name === "Grace Achieng")!;

  return {
    roles: DEFAULT_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })),
    users: [
      user("u-wanjiku", "wanjiku@example.com", wanjiku.name, "client", { clientId: wanjiku.id }),
      user("u-brian", "brian@example.com", brian.name, "client", { clientId: brian.id }),
      user("u-grace", "grace@example.com", grace.name, "client", { clientId: grace.id }),

      user("u-kiprop", "john.kiprop@takasafi.co.ke", "John Kiprop", "collector", {
        truckId: "KDA 412X",
        companyId: "TS",
      }),
      user("u-wairimu", "ruth.wairimu@mazingira.co.ke", "Ruth Wairimu", "collector", {
        truckId: "KDG 230Q",
        companyId: "MZ",
      }),

      user("u-ts-agent", "care@takasafi.co.ke", "Njeri Mwaura", "company_agent", {
        companyId: "TS",
      }),
      user("u-ts-admin", "ops@takasafi.co.ke", "Salim Abdalla", "company_admin", {
        companyId: "TS",
      }),
      user("u-kw-admin", "ops@kijaniwaste.co.ke", "Lydia Cheruiyot", "company_admin", {
        companyId: "KW",
      }),

      user("u-platform", "admin@safisha.go.ke", "Achieng Odhiambo", "platform_admin", {}),
    ],
  };
}

function store(): AccessStore {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = seedStore();
  return g[GLOBAL_KEY];
}

/* ---------------- roles ---------------- */

export const listRoles = (): RoleDef[] => store().roles.map((r) => ({ ...r, permissions: [...r.permissions] }));

export const findRole = (id: string): RoleDef | undefined => store().roles.find((r) => r.id === id);

export function setRolePermissions(roleId: string, permissions: string[]): RoleDef | null {
  const role = store().roles.find((r) => r.id === roleId);
  if (!role) return null;
  // Never trust the wire: keep only ids that exist in the catalogue.
  role.permissions = [...new Set(permissions.filter(isPermissionId))];
  return { ...role, permissions: [...role.permissions] };
}

export function createRole(input: {
  name: string;
  description: string;
  workspace: Workspace;
  permissions: string[];
}): RoleDef | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Give the role a name." };

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!id) return { error: "Give the role a name using letters or numbers." };
  if (store().roles.some((r) => r.id === id)) return { error: "A role with that name exists." };

  const role: RoleDef = {
    id,
    name,
    description: input.description.trim(),
    workspace: input.workspace,
    system: false,
    permissions: [...new Set(input.permissions.filter(isPermissionId))],
  };
  store().roles.push(role);
  return { ...role, permissions: [...role.permissions] };
}

export function deleteRole(roleId: string): { ok: true } | { error: string } {
  const s = store();
  const role = s.roles.find((r) => r.id === roleId);
  if (!role) return { error: "No such role." };
  if (role.system) return { error: "Built-in roles cannot be deleted." };

  const holders = s.users.filter((u) => u.roleId === roleId).length;
  if (holders > 0) {
    return { error: `${holders} user${holders === 1 ? "" : "s"} still hold this role.` };
  }
  s.roles = s.roles.filter((r) => r.id !== roleId);
  return { ok: true };
}

/* ---------------- users ---------------- */

export const toPublicUser = ({ passwordHash: _hash, ...rest }: User): PublicUser => rest;

export const listUsers = (): PublicUser[] => store().users.map(toPublicUser);

export const findUserById = (id: string): User | undefined => store().users.find((u) => u.id === id);

export const findUserByEmail = (email: string): User | undefined =>
  store().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

export function recordLogin(userId: string, at: string) {
  const u = findUserById(userId);
  if (u) u.lastLoginAt = at;
}

export interface UserPatch {
  roleId?: string;
  grants?: string[];
  denies?: string[];
  suspended?: boolean;
}

export function updateUser(userId: string, patch: UserPatch): PublicUser | { error: string } {
  const u = findUserById(userId);
  if (!u) return { error: "No such user." };

  if (patch.roleId !== undefined) {
    if (!findRole(patch.roleId)) return { error: "No such role." };
    u.roleId = patch.roleId;
  }
  if (patch.grants !== undefined) u.grants = [...new Set(patch.grants.filter(isPermissionId))];
  if (patch.denies !== undefined) u.denies = [...new Set(patch.denies.filter(isPermissionId))];
  if (patch.suspended !== undefined) u.suspended = patch.suspended;

  return toPublicUser(u);
}

/**
 * Effective permissions: the role's set, plus personal grants, minus personal
 * denies. Deny always wins — that is what makes an override a safe way to pull
 * one capability from one person without forking the role.
 */
export function effectivePermissions(user: Pick<User, "roleId" | "grants" | "denies">): string[] {
  const role = findRole(user.roleId);
  const set = new Set(role ? role.permissions : []);
  for (const g of user.grants) set.add(g);
  for (const d of user.denies) set.delete(d);
  return [...set].sort();
}

/** How many people would be affected by editing a role. */
export function roleUsage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const u of store().users) counts[u.roleId] = (counts[u.roleId] ?? 0) + 1;
  return counts;
}
