import { deleteRole, setRolePermissions } from "@/server/accessStore";
import { errorResponse, requirePermission } from "@/server/session";

type Params = { params: Promise<{ roleId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requirePermission("access.roles.manage");
    const { roleId } = await params;
    const body = await request.json();

    if (!Array.isArray(body.permissions)) {
      return Response.json({ error: "Expected a permissions array." }, { status: 400 });
    }

    const role = setRolePermissions(roleId, body.permissions.map(String));
    if (!role) return Response.json({ error: "No such role." }, { status: 404 });

    return Response.json({ role });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requirePermission("access.roles.manage");
    const { roleId } = await params;

    const result = deleteRole(roleId);
    if ("error" in result) return Response.json(result, { status: 400 });

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
