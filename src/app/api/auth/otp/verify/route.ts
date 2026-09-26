import { verifyOtp } from "@/server/authFlows";
import { TOO_MANY_TRIES, clearLimit, ensureNotLimited, signinLimits, spend } from "@/server/rateLimit";
import { errorResponse } from "@/server/session";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone ?? "");
  try {
    const limits = await signinLimits(phone);
    await ensureNotLimited(limits, TOO_MANY_TRIES);
    const user = await verifyOtp(phone, String(body.code ?? ""));
    if (!user) {
      await spend(limits, TOO_MANY_TRIES);
      return Response.json({ error: "That code is wrong or has expired." }, { status: 400 });
    }
    await clearLimit(limits[0][0]);
    const signed = await issueSession(user);
    if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
    return Response.json({ ok: true, workspace: signed.workspace, mfa: signed.mfa });
  } catch (err) {
    return errorResponse(err);
  }
}
