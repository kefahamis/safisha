import { audit } from "@/server/audit";
import { backupKey, BackupUnavailable, listBackups, runBackup } from "@/server/backup";
import { errorResponse, HttpError, requirePermission } from "@/server/session";
import { blobConfigured } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The stored backups, and whether backups can run at all. */
export async function GET() {
  try {
    await requirePermission("settings.platform.manage");
    return Response.json({
      ready: { key: Boolean(backupKey()), blob: blobConfigured() },
      backups: await listBackups(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Takes a backup now, as the nightly job would. */
export async function POST() {
  try {
    const session = await requirePermission("settings.platform.manage");
    const result = await runBackup().catch((err) => {
      if (err instanceof BackupUnavailable) throw new HttpError(409, err.message);
      throw err;
    });
    await audit(session, { action: "backup.run", detail: result });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
