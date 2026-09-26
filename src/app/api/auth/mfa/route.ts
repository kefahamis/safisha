import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { challengeView, passkeySignInOptions, pendingUser, sendChallengeCode, verifyChallenge } from "@/server/mfa";
import { errorResponse, HttpError } from "@/server/session";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The second step of signing in: which methods this person can use. */
export async function GET() {
  try {
    return Response.json(await challengeView(await pendingUser()), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  action: z.enum(["send", "passkey.options", "verify"]),
  method: z.enum(["sms", "email", "totp", "passkey", "recovery"]).optional(),
  code: z.string().max(20).optional(),
  response: z.unknown().optional(),
  remember: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await pendingUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    const b = parsed.data;
    if (b.action === "send") {
      if (b.method !== "sms" && b.method !== "email") throw new HttpError(400, "Only SMS and email send a code.");
      return Response.json(await sendChallengeCode(user, b.method));
    }
    if (b.action === "passkey.options") return Response.json(await passkeySignInOptions(user));

    if (!b.method) throw new HttpError(400, "Pick a sign-in method.");
    const done = await verifyChallenge(user, {
      method: b.method,
      code: b.code,
      response: b.response as AuthenticationResponseJSON | undefined,
      remember: b.remember,
    });
    const signed = await issueSession(user, { secondStepDone: done.method });
    if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
    return Response.json({ ok: true, workspace: signed.workspace, recoveryLeft: done.recoveryLeft });
  } catch (err) {
    return errorResponse(err);
  }
}
