import { buildSnapshot } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in session's slice of the data, for the client store. */
export async function GET() {
  try {
    const session = await requireSession({ allowSetup: true });
    return Response.json(await buildSnapshot(session), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
