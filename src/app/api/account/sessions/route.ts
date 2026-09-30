import { z } from "zod";
import { audit } from "@/server/audit";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { listSessions, revokeOtherSessions, revokeSession } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Your recent sign-ins: device, address, when, and whether each is still signed in. */
export async function GET() {
  try {
    const session = await requireSession();
    return Response.json({ sessions: await listSessions(session.sub, session.sid), tracked: Boolean(session.sid) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ action: z.enum(["revoke", "revokeOthers"]), id: z.string().max(60).optional() });

/** Sign one device out, or every device but this one. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    let signedOut = 0;
    if (parsed.data.action === "revoke") {
      if (!parsed.data.id) throw new HttpError(400, "Pick a sign-in.");
      if (parsed.data.id === session.sid) throw new HttpError(400, "Use Sign out to end this one.");
      signedOut = (await revokeSession(parsed.data.id, session.sub)) ? 1 : 0;
    } else {
      signedOut = await revokeOtherSessions(session.sub, session.sid);
    }
    if (signedOut) await audit(session, { action: "profile.signout", target: session.email, detail: { signedOut } });
    return Response.json({ ok: true, signedOut, sessions: await listSessions(session.sub, session.sid) });
  } catch (err) {
    return errorResponse(err);
  }
}
