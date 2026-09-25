import { WORKSPACES, type Workspace } from "@/lib/auth/types";
import { createRole, listRoles, roleUsage } from "@/server/accessStore";
import { errorResponse, requirePermission } from "@/server/session";

export async function GET() {
  try {
    await requirePermission("access.roles.manage");
    return Response.json({ roles: listRoles(), usage: roleUsage() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("access.roles.manage");
    const body = await request.json();

    const workspace = String(body.workspace ?? "");
    if (!WORKSPACES.includes(workspace as Workspace)) {
      return Response.json({ error: "Pick a workspace for the role." }, { status: 400 });
    }

    const result = createRole({
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      workspace: workspace as Workspace,
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
    });

    if ("error" in result) return Response.json(result, { status: 400 });
    return Response.json({ role: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
