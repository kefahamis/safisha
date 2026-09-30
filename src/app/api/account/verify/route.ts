import { eq } from "drizzle-orm";
import { z } from "zod";
import { maskEmail, maskPhone } from "@/lib/security";
import { findUserById } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { consumeCode, issueCode, mayRevealCodes } from "@/server/authFlows";
import { platformIdentity } from "@/server/branding";
import { getDb, schema } from "@/server/db";
import { sendEmail, sendSms } from "@/server/integrations/messaging";
import { codeLimits, spend, TOO_MANY_CODES } from "@/server/rateLimit";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { nowStamp } from "@/server/time";

export const runtime = "nodejs";

const Body = z.object({
  action: z.enum(["email.start", "email.confirm", "phone.start", "phone.confirm"]),
  code: z.string().max(12).optional(),
});

/**
 * Proves the email or phone on the Profile page is really theirs: a code is
 * sent there, and typing it back marks it verified. Separate from two-step
 * sign-in, which has its own codes.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const user = await findUserById(session.sub);
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    const { action, code } = parsed.data;
    const channel = action.startsWith("email") ? "email" : "phone";
    const target = channel === "email" ? user.email.toLowerCase() : user.phone;
    if (!target) throw new HttpError(400, "Add a mobile number first.");
    const purpose = `profile-${channel}`;

    if (action.endsWith(".start")) {
      await spend(await codeLimits(target), TOO_MANY_CODES);
      const sent = await issueCode(purpose, user, target);
      const name = (await platformIdentity()).name;
      const res =
        channel === "email"
          ? await sendEmail({ to: target, subject: `Your ${name} verification code`, text: `Your code is ${sent}. It expires in 15 minutes.` })
          : await sendSms({ to: target, company: user.scope.companyId ?? null, purpose: "verify", body: `${name}: your verification code is ${sent}. It expires in 15 minutes.` });
      return Response.json({
        sentTo: channel === "email" ? maskEmail(target) : maskPhone(target),
        // Only in demo mode, when nothing could deliver it.
        demoCode: res.status !== "sent" && mayRevealCodes() ? sent : undefined,
      });
    }

    if (!code || !(await consumeCode(purpose, target, code))) throw new HttpError(400, "That code is wrong or has expired.");
    const db = await getDb();
    await db
      .update(schema.users)
      .set(channel === "email" ? { emailVerifiedAt: nowStamp() } : { phoneVerifiedAt: nowStamp() })
      .where(eq(schema.users.id, user.id));
    await audit(session, { action: "profile.verify", target: user.email, detail: { channel } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
