import { updateUser, type UserPatch } from "@/server/accessStore";
import { errorResponse, requirePermission } from "@/server/session";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("access.users.manage");
    const { userId } = await params;
    const body = await request.json();

    // Guard against an admin locking themselves out of access management.
    if (userId === session.sub && (body.suspended === true || body.roleId !== undefined)) {
      return Response.json(
        { error: "You cannot change your own role or suspend yourself." },
        { status: 400 },
      );
    }

    const patch: UserPatch = {};
    if (typeof body.roleId === "string") patch.roleId = body.roleId;
    if (Array.isArray(body.grants)) patch.grants = body.grants.map(String);
    if (Array.isArray(body.denies)) patch.denies = body.denies.map(String);
    if (typeof body.suspended === "boolean") patch.suspended = body.suspended;

    const result = updateUser(userId, patch);
    if ("error" in result) return Response.json(result, { status: 400 });

    return Response.json({ user: result });
  } catch (err) {
    return errorResponse(err);
  }
}
