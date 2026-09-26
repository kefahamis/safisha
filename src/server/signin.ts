// Server-only. Issues a session cookie for a verified user.
import { cookies } from "next/headers";
import { allowedWorkspaces } from "@/lib/auth/defaultRoles";
import type { User } from "@/lib/auth/types";
import { findRole, recordLogin } from "./accessStore";
import { audit } from "./audit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./jwt";
import { signInGate } from "./mfa";
import { nowStamp } from "./time";

export type SignInResult =
  | { ok: true; workspace: string; /** A second step is needed before the session starts. */ mfa?: true }
  | { ok: false; error: string; status: number };

/**
 * Every way in — password, phone code, reset, invitation — ends here. With
 * two-step sign-in on, a correct first step only earns the second one; the
 * session starts when that passes (`secondStepDone`).
 */
export async function issueSession(user: User, opts: { secondStepDone?: string } = {}): Promise<SignInResult> {
  if (user.suspended) {
    return { ok: false, status: 403, error: "This account is suspended. Contact your administrator." };
  }
  const role = await findRole(user.roleId);
  if (!role) return { ok: false, status: 403, error: "This account has no valid role." };

  const gate = opts.secondStepDone ? "session" : await signInGate(user, role.workspace);
  if (gate === "challenge") return { ok: true, workspace: role.workspace, mfa: true };

  const token = await signSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    ws: role.workspace,
    scope: user.scope,
    allowed: allowedWorkspaces(role),
    // Required but not set up: in, but held on the security page until it is.
    ...(gate === "setup" ? { setup: true } : {}),
  });
  await recordLogin(user.id, nowStamp());
  // Clients sign in all day; the log is for staff access.
  if (role.workspace !== "client") {
    await audit(
      { sub: user.id, name: user.name, scope: user.scope },
      {
        action: "user.signin",
        target: user.email,
        company: user.scope.companyId ?? null,
        detail: { role: role.name, ...(opts.secondStepDone ? { twoStep: opts.secondStepDone } : {}) },
      },
    );
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  return { ok: true, workspace: role.workspace };
}
