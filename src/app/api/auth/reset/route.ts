import { resetPassword } from "@/server/authFlows";
import { TOO_MANY_TRIES, clearLimit, ensureNotLimited, signinLimits, spend } from "@/server/rateLimit";
import { errorResponse } from "@/server/session";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";

/** Checks the code, sets the new password and signs the person in. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier ?? "");
  try {
    const limits = await signinLimits(identifier);
    await ensureNotLimited(limits, TOO_MANY_TRIES);
    const res = await resetPassword(identifier, String(body.code ?? ""), String(body.password ?? ""));
    if (!res.ok || !res.user) {
      // A too-short password isn't a guess; a wrong code is.
      if (res.error?.startsWith("That code")) await spend(limits, TOO_MANY_TRIES);
      return Response.json({ error: res.error }, { status: 400 });
    }
    await clearLimit(limits[0][0]);
    const signed = await issueSession(res.user);
    if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
    return Response.json({ ok: true, workspace: signed.workspace, mfa: signed.mfa });
  } catch (err) {
    return errorResponse(err);
  }
}
