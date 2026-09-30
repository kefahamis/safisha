import { PreferencesBody, profileView, savePreferences } from "@/server/account";
import { findUserById } from "@/server/accessStore";
import { errorResponse, HttpError, requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Language, appearance, photo, start page, and the agent or client settings that apply to this person. */
export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const user = await findUserById(session.sub);
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = PreferencesBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "That request isn't valid.");
    await savePreferences(session, user, parsed.data);
    const fresh = await findUserById(user.id);
    return Response.json({ ok: true, view: await profileView(session, fresh!) });
  } catch (err) {
    return errorResponse(err);
  }
}
