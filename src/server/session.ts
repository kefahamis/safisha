// Server-only. Resolves the signed token into a live session.
import { cookies } from "next/headers";
import { allowedWorkspaces } from "@/lib/auth/defaultRoles";
import type { Session } from "@/lib/auth/types";
import { effectivePermissions, findRole, findUserById, userDepartment } from "./accessStore";
import { SESSION_COOKIE, verifySession } from "./jwt";

/**
 * Reads the session cookie and re-resolves permissions from the store on every
 * request, so an admin's change to a role takes effect immediately rather than
 * when the user next signs in.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  // The token is valid, but the account may have been suspended or deleted since.
  const user = await findUserById(claims.sub);
  if (!user || user.suspended) return null;

  const role = await findRole(user.roleId);
  const department = await userDepartment(user);

  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    ws: role?.workspace ?? claims.ws,
    scope: user.scope,
    roleName: role?.name ?? user.roleId,
    department: department ? { id: department.id, name: department.name } : undefined,
    lang: user.lang === "sw" ? "sw" : "en",
    permissions: await effectivePermissions(user, role, department),
    allowed: role ? allowedWorkspaces(role) : [claims.ws],
  };
}

/** Throws if there is no session — for route handlers that must be signed in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  return session;
}

/** Throws unless the session carries every listed permission. */
export async function requirePermission(...permissions: string[]): Promise<Session> {
  const session = await requireSession();
  const missing = permissions.filter((p) => !session.permissions.includes(p));
  if (missing.length) {
    throw new HttpError(403, `Missing permission: ${missing.join(", ")}`);
  }
  return session;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turns a thrown HttpError into a JSON response; rethrows anything else. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
