import type { Role } from "@/lib/types";

/** Which dashboard a role lands in. Mirrors the four navigation trees. */
export type Workspace = Role;

export const WORKSPACES: Workspace[] = ["client", "company", "collector", "admin"];

export interface RoleDef {
  id: string;
  name: string;
  description: string;
  workspace: Workspace;
  /** Permission ids carried by everyone holding this role. */
  permissions: string[];
  /** System roles cannot be deleted and cannot change workspace. */
  system: boolean;
}

/** What a user is scoped to — the row-level half of authorisation. */
export interface UserScope {
  companyId?: string;
  clientId?: string;
  truckId?: string;
}

export interface User {
  id: string;
  email: string;
  /** Used for SMS sign-in codes and password resets. */
  phone?: string;
  name: string;
  roleId: string;
  scope: UserScope;
  /** Interface language: "en" or "sw". */
  lang?: string;
  /** Permissions added on top of the role, for this person only. */
  grants: string[];
  /** Permissions withheld even though the role carries them. Deny wins. */
  denies: string[];
  suspended: boolean;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
}

/** The signed half of the session — what the JWT carries. */
export interface SessionClaims {
  sub: string;
  name: string;
  email: string;
  roleId: string;
  /** Workspace is in the token so Edge middleware can gate routes without the store. */
  ws: Workspace;
  scope: UserScope;
}

/** The resolved session handed to the app, permissions computed per request. */
export interface Session extends SessionClaims {
  roleName: string;
  lang: string;
  permissions: string[];
  /** Dashboards this session may open, including its home workspace. */
  allowed: Workspace[];
}

export type PublicUser = Omit<User, "passwordHash">;
