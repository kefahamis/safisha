import { audit } from "@/server/audit";
import { BACKUP_PREFIX } from "@/server/backup";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";

/** Streams one encrypted backup file to a platform admin, for restoring elsewhere. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.platform.manage");
    const pathname = new URL(request.url).searchParams.get("path") ?? "";
    if (!pathname.startsWith(BACKUP_PREFIX) || pathname.includes("..")) throw new HttpError(400, "Not a backup.");
    const { get } = await import("@vercel/blob");
    const blob = await get(pathname, { access: "private" });
    if (!blob?.stream) throw new HttpError(404, "That backup is gone.");
    await audit(session, { action: "backup.download", target: pathname });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${pathname.slice(BACKUP_PREFIX.length)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
