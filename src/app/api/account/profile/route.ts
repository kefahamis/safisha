import { z } from "zod";
import { KE_MOBILE, normalisePhone } from "@/lib/clientNumber";
import { profileView } from "@/server/account";
import { findUserById, setProfile } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { securityView } from "@/server/mfa";
import { verifyPassword } from "@/server/password";
import { TOO_MANY_TRIES, clearLimit, ensureNotLimited, signinLimits, spend } from "@/server/rateLimit";
import { errorResponse, HttpError, requireSession } from "@/server/session";

// scrypt needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  const session = await requireSession();
  const user = await findUserById(session.sub);
  if (!user) throw new HttpError(401, "Not signed in");
  return { session, user };
}

/** Your own name, email and phone. */
export async function GET() {
  try {
    const { session, user } = await me();
    return Response.json(await profileView(session, user), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80, "That name is too long."),
  email: z.string().trim().max(120).email("Enter a valid email address."),
  phone: z.string().trim().max(20),
  currentPassword: z.string().max(200).optional(),
});

export async function PATCH(request: Request) {
  try {
    const { session, user } = await me();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "That request isn't valid.");
    const b = parsed.data;

    const phone = b.phone ? b.phone.replace(/\s/g, "") : "";
    if (phone && !KE_MOBILE.test(phone)) throw new HttpError(400, "Enter a Kenyan mobile number like 0712 345 678.");
    const nextPhone = phone ? normalisePhone(phone) : null;

    const emailChanged = b.email.toLowerCase() !== user.email.toLowerCase();
    const phoneChanged = (nextPhone ?? "") !== normalisePhone(user.phone ?? "");

    // Email and phone are where sign-in and reset codes go, so changing them needs the password.
    if (emailChanged || phoneChanged) {
      const sec = await securityView(user);
      if (emailChanged && sec.factors.some((f) => f.method === "email")) {
        throw new HttpError(400, "Turn off email codes on your Security page before changing your email.");
      }
      if (phoneChanged && sec.factors.some((f) => f.method === "sms")) {
        throw new HttpError(400, "Turn off SMS codes on your Security page before changing your phone number.");
      }
      const limits = await signinLimits(user.email);
      await ensureNotLimited(limits, TOO_MANY_TRIES);
      if (!b.currentPassword || !verifyPassword(b.currentPassword, user.passwordHash)) {
        await spend(limits, TOO_MANY_TRIES);
        throw new HttpError(400, "Your current password is incorrect.");
      }
      await clearLimit(limits[0][0]);
    }

    const saved = await setProfile(user.id, { name: b.name, email: b.email, phone: nextPhone });
    if ("error" in saved) throw new HttpError(409, saved.error);

    const changed = [
      b.name.trim() !== user.name && "name",
      emailChanged && "email",
      phoneChanged && "phone",
    ].filter(Boolean);
    if (changed.length) {
      await audit(session, { action: "profile.update", target: saved.email, detail: { changed } });
    }
    return Response.json({ ok: true, view: await profileView(session, saved) });
  } catch (err) {
    return errorResponse(err);
  }
}
