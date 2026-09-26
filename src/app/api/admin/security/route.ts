import type { SecurityPolicy } from "@/lib/security";
import { audit } from "@/server/audit";
import { saveSecurityPolicy, securityPolicy } from "@/server/mfa";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Two-step sign-in policy for each kind of account. Platform admin only. */
export async function GET() {
  try {
    await requirePermission("settings.platform.manage");
    return Response.json(await securityPolicy(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePermission("settings.platform.manage");
    const body = (await request.json().catch(() => ({}))) as SecurityPolicy;
    const saved = await saveSecurityPolicy(body, session.name);
    await audit(session, {
      action: "security.policy",
      detail: Object.fromEntries(
        Object.entries(saved).map(([k, v]) => [k, `${v.requirement}: ${v.methods.join("/") || "none"}, remember ${v.rememberDays}d`]),
      ),
    });
    return Response.json(saved);
  } catch (err) {
    return errorResponse(err);
  }
}
