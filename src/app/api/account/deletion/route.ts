import { z } from "zod";
import { requestDeletion } from "@/server/account";
import { findUserById } from "@/server/accessStore";
import { errorResponse, HttpError, requireSession } from "@/server/session";

export const runtime = "nodejs";

const Body = z.object({ reason: z.string().max(500).optional() });

/** A client asks their company to close the account and erase their personal data. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const user = await findUserById(session.sub);
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    return Response.json(await requestDeletion(session, user, parsed.data.reason ?? ""));
  } catch (err) {
    return errorResponse(err);
  }
}
