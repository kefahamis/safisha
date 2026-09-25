import { deleteRole, findRole, setRolePermissions } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { errorResponse, requirePermission } from "@/server/session";

type Params = { params: Promise<{ roleId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("access.roles.manage");
    const { roleId } = await params;
    const body = await request.json();

    if (!Array.isArray(body.permissions)) {
      return Response.json({ error: "Expected a permissions array." }, { status: 400 });
    }

    const before = await findRole(roleId);
    const role = await setRolePermissions(roleId, body.permissions.map(String));
    if (!role || !before) return Response.json({ error: "No such role." }, { status: 404 });

    await audit(session, {
      action: "role.permissions",
      target: roleId,
      company: null,
      detail: {
        added: role.permissions.filter((p) => !before.permissions.includes(p)),
        removed: before.permissions.filter((p) => !role.permissions.includes(p)),
      },
    });

    return Response.json({ role });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("access.roles.manage");
    const { roleId } = await params;

    const result = await deleteRole(roleId);
    if ("error" in result) return Response.json(result, { status: 400 });
    await audit(session, { action: "role.delete", target: roleId, company: null });

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
