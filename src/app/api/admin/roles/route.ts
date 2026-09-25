import { WORKSPACES, type Workspace } from "@/lib/auth/types";
import { createRole, listRoles, roleUsage } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { errorResponse, requirePermission } from "@/server/session";

export async function GET() {
  try {
    await requirePermission("access.roles.manage");
    return Response.json({ roles: await listRoles(), usage: await roleUsage() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("access.roles.manage");
    const body = await request.json();

    const workspace = String(body.workspace ?? "");
    if (!WORKSPACES.includes(workspace as Workspace)) {
      return Response.json({ error: "Pick a workspace for the role." }, { status: 400 });
    }

    const result = await createRole({
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      workspace: workspace as Workspace,
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
    });

    if ("error" in result) return Response.json(result, { status: 400 });
    await audit(session, {
      action: "role.create",
      target: result.id,
      company: null,
      detail: { name: result.name, workspace: result.workspace },
    });
    return Response.json({ role: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
