import { z } from "zod";
import { findUserById, setPassword } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/password";
import { TOO_MANY_TRIES, clearLimit, ensureNotLimited, signinLimits, spend } from "@/server/rateLimit";
import { errorResponse, HttpError, requireSession } from "@/server/session";

// scrypt needs the Node runtime.
export const runtime = "nodejs";

const Body = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(200, "That password is too long."),
});

/** Changes your own password, given the current one. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const user = await findUserById(session.sub);
    if (!user) throw new HttpError(401, "Not signed in");

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "That request isn't valid.");
    const { currentPassword, newPassword } = parsed.data;

    // A wrong current password counts against the same limit as signing in.
    const limits = await signinLimits(user.email);
    await ensureNotLimited(limits, TOO_MANY_TRIES);
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      await spend(limits, TOO_MANY_TRIES);
      throw new HttpError(400, "Your current password is incorrect.");
    }
    await clearLimit(limits[0][0]);

    if (newPassword === currentPassword) throw new HttpError(400, "Choose a password you haven't been using.");

    await setPassword(user.id, hashPassword(newPassword));
    await audit(session, { action: "profile.password", target: user.email });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
