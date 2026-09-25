// Server-only. Issues a session cookie for a verified user.
import { cookies } from "next/headers";
import { allowedWorkspaces } from "@/lib/auth/defaultRoles";
import type { User } from "@/lib/auth/types";
import { findRole, recordLogin } from "./accessStore";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./jwt";
import { nowStamp } from "./time";

export async function issueSession(user: User): Promise<{ ok: true; workspace: string } | { ok: false; error: string; status: number }> {
  if (user.suspended) {
    return { ok: false, status: 403, error: "This account is suspended. Contact your administrator." };
  }
  const role = await findRole(user.roleId);
  if (!role) return { ok: false, status: 403, error: "This account has no valid role." };

  const token = await signSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    ws: role.workspace,
    scope: user.scope,
    allowed: allowedWorkspaces(role),
  });
  await recordLogin(user.id, nowStamp());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  return { ok: true, workspace: role.workspace };
}
