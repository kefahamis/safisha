import { audit } from "@/server/audit";
import { purgeAuditLog, retentionPreview } from "@/server/auditRetention";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many entries each category holds, and how many are past their limit. */
export async function GET() {
  try {
    await requirePermission("settings.platform.manage");
    return Response.json(await retentionPreview(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Removes entries past their limit now, rather than waiting for tonight's maintenance. */
export async function POST() {
  try {
    const session = await requirePermission("settings.platform.manage");
    const result = await purgeAuditLog({ force: true });
    await audit(session, { action: "audit.purge", detail: { ...result, manual: true } });
    return Response.json({ ...result, preview: await retentionPreview() });
  } catch (err) {
    return errorResponse(err);
  }
}
