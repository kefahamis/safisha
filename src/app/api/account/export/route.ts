import { exportMyData } from "@/server/account";
import { findUserById } from "@/server/accessStore";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { today } from "@/server/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything held about you, as a JSON file to download. */
export async function GET() {
  try {
    const session = await requireSession();
    const user = await findUserById(session.sub);
    if (!user) throw new HttpError(401, "Not signed in");
    const data = await exportMyData(session, user);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-data-${today()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
