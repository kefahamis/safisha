// Server-only. Resolves the signed token into a live session.
import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { allowedWorkspaces } from "@/lib/auth/defaultRoles";
import type { Session, User, Workspace } from "@/lib/auth/types";
import { effectivePermissions, findRole, findUserById, userDepartment } from "./accessStore";
import { ConfigError } from "./configError";
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
  return sessionForUser(user, { ws: claims.ws, setup: claims.setup });
}

/** A user's live session: their role, department and permissions as they stand now. */
export async function sessionForUser(user: User, token: { ws: Workspace; setup?: boolean }): Promise<Session> {
  const role = await findRole(user.roleId);
  const department = await userDepartment(user);

  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    ws: role?.workspace ?? token.ws,
    scope: user.scope,
    roleName: role?.name ?? user.roleId,
    department: department ? { id: department.id, name: department.name } : undefined,
    lang: user.lang === "sw" ? "sw" : "en",
    permissions: await effectivePermissions(user, role, department),
    allowed: role ? allowedWorkspaces(role) : [token.ws],
    setupRequired: token.setup ? true : undefined,
  };
}

/**
 * Throws if there is no session — for route handlers that must be signed in.
 * Someone held for two-step setup can reach only what's marked `allowSetup`.
 */
export async function requireSession(opts: { allowSetup?: boolean } = {}): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  if (session.setupRequired && !opts.allowSetup) {
    throw new HttpError(403, "Set up two-step sign-in first, on your Security page.");
  }
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

/**
 * Turns a thrown error into a JSON response the app's screens can show. An
 * HttpError carries its own status and message; a missing setting says which;
 * anything else is logged and reported to Sentry, and the person gets a
 * reference to quote rather than a bare error page.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const ref = randomBytes(4).toString("hex").toUpperCase();
  console.error(`Unhandled error ${ref}`, err);
  Sentry.captureException(err, { tags: { ref } });
  if (err instanceof ConfigError) {
    return Response.json({ error: err.message, ref }, { status: 503 });
  }
  return Response.json({ error: `Something went wrong on the server (ref ${ref}). Try again; if it keeps happening, quote the ref.`, ref }, { status: 500 });
}
