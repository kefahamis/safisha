import { audit } from "@/server/audit";
import { createInvite } from "@/server/authFlows";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";

/** Invites a staff member: they get a link to set their own password. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("access.users.manage");
    const body = await request.json().catch(() => ({}));
    const scope: { companyId?: string; truckId?: string; clientId?: string } = {};
    if (body.companyId) scope.companyId = String(body.companyId);
    if (body.truckId) scope.truckId = String(body.truckId);
    if (body.clientId) scope.clientId = String(body.clientId);

    const res = await createInvite(
      {
        email: String(body.email ?? ""),
        name: String(body.name ?? ""),
        roleId: String(body.roleId ?? ""),
        phone: body.phone ? String(body.phone) : undefined,
        scope,
      },
      session.name,
    );
    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
    await audit(session, {
      action: "user.invite",
      target: String(body.email),
      company: scope.companyId ?? null,
      detail: { role: body.roleId, emailed: res.emailed },
    });
    return Response.json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
