import { buildSnapshot, snapshotVersion } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in session's slice of the data, for the client store. Polls send
 * the version they hold; if nothing they can see has changed since, the answer
 * is an empty 304 and the snapshot is never rebuilt.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession({ allowSetup: true });
    const held = request.headers.get("if-none-match");
    if (held && held === (await snapshotVersion(session))) {
      return new Response(null, { status: 304, headers: { "Cache-Control": "no-store", ETag: held } });
    }
    const snapshot = await buildSnapshot(session);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store", ETag: snapshot.version ?? "" } });
  } catch (err) {
    return errorResponse(err);
  }
}
