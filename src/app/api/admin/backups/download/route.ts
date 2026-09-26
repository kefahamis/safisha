import { audit } from "@/server/audit";
import { isBackupName } from "@/server/backup";
import { errorResponse, HttpError, requirePermission } from "@/server/session";
import { blobStore } from "@/server/storage";

export const runtime = "nodejs";

/** Streams one encrypted backup file to a platform admin, for restoring elsewhere. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.platform.manage");
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!isBackupName(name)) throw new HttpError(400, "Not a backup.");
    const stream = await (await blobStore("backups")).get(name, { type: "stream" });
    if (!stream) throw new HttpError(404, "That backup is gone.");
    await audit(session, { action: "backup.download", target: name });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
