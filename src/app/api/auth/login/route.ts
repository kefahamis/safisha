import { cookies } from "next/headers";
import { allowedWorkspaces } from "@/lib/auth/defaultRoles";
import { stamp } from "@/lib/format";
import { findRole, findUserByEmail, recordLogin } from "@/server/accessStore";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/jwt";
import { verifyPassword } from "@/server/password";

// scrypt needs the Node runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "Enter an email and password." }, { status: 400 });
  }

  const user = findUserByEmail(email);
  // Same message either way — don't reveal which addresses have accounts.
  const invalid = Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  if (!user || !verifyPassword(password, user.passwordHash)) return invalid;

  if (user.suspended) {
    return Response.json(
      { error: "This account is suspended. Contact your administrator." },
      { status: 403 },
    );
  }

  const role = findRole(user.roleId);
  if (!role) {
    return Response.json({ error: "This account has no valid role." }, { status: 403 });
  }

  const token = await signSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    ws: role.workspace,
    scope: user.scope,
    allowed: allowedWorkspaces(role),
  });

  recordLogin(user.id, stamp(new Date()));

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);

  return Response.json({ ok: true, workspace: role.workspace });
}
