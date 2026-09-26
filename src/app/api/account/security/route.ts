import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { findUserById } from "@/server/accessStore";
import { audit } from "@/server/audit";
import {
  confirmEmail,
  confirmSms,
  confirmTotp,
  forgetDevice,
  newRecoveryCodes,
  passkeyRegistrationOptions,
  registerPasskey,
  removeFactor,
  securityView,
  startEmail,
  startSms,
  startTotp,
  type SetupResult,
} from "@/server/mfa";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  // Reachable while held for setup: this is where setup happens.
  const session = await requireSession({ allowSetup: true });
  const user = await findUserById(session.sub);
  if (!user) throw new HttpError(401, "Not signed in");
  return { session, user };
}

/** Your own sign-in methods, and what your account type allows. */
export async function GET() {
  try {
    const { user } = await me();
    return Response.json(await securityView(user), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  action: z.enum([
    "sms.start",
    "sms.confirm",
    "email.start",
    "email.confirm",
    "totp.start",
    "totp.confirm",
    "passkey.options",
    "passkey.register",
    "factor.remove",
    "recovery.regenerate",
    "device.forget",
  ]),
  phone: z.string().max(20).optional(),
  code: z.string().max(20).optional(),
  label: z.string().max(40).optional(),
  id: z.number().int().optional(),
  response: z.unknown().optional(),
});

export async function POST(request: Request) {
  try {
    const { session, user } = await me();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    const b = parsed.data;

    // Turning a method on: afterwards, lift any setup hold with a fresh session.
    const enabled = async (res: SetupResult, method: string) => {
      await audit(session, { action: "security.enable", target: user.email, detail: { method } });
      let unlocked = false;
      if (session.setupRequired) {
        const fresh = await findUserById(user.id);
        if (fresh) unlocked = (await issueSession(fresh, { secondStepDone: "setup" })).ok;
      }
      return Response.json({ ...res, unlocked, view: await securityView(user) });
    };

    switch (b.action) {
      case "sms.start":
        return Response.json(await startSms(user, b.phone ?? ""));
      case "sms.confirm":
        return enabled(await confirmSms(user, b.phone ?? "", b.code ?? ""), "sms");
      case "email.start":
        return Response.json(await startEmail(user));
      case "email.confirm":
        return enabled(await confirmEmail(user, b.code ?? ""), "email");
      case "totp.start":
        return Response.json(await startTotp(user));
      case "totp.confirm":
        return enabled(await confirmTotp(user, b.code ?? "", b.label ?? ""), "totp");
      case "passkey.options":
        return Response.json(await passkeyRegistrationOptions(user));
      case "passkey.register":
        return enabled(await registerPasskey(user, b.response as RegistrationResponseJSON, b.label ?? ""), "passkey");
      case "factor.remove":
        await removeFactor(user, b.id ?? -1);
        await audit(session, { action: "security.disable", target: user.email, detail: { factor: b.id } });
        return Response.json({ ok: true, view: await securityView(user) });
      case "recovery.regenerate": {
        const view = await securityView(user);
        if (!view.factors.length) throw new HttpError(400, "Turn on a sign-in method first.");
        const codes = await newRecoveryCodes(user.id);
        await audit(session, { action: "security.recovery", target: user.email });
        return Response.json({ ok: true, recoveryCodes: codes, view: await securityView(user) });
      }
      case "device.forget":
        await forgetDevice();
        return Response.json({ ok: true });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
