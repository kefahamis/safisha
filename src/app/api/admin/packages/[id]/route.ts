import { deletePackage, PackageBody, updatePackage } from "@/server/packages";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { id } = await params;
    const parsed = PackageBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the package details.");
    return Response.json({ package: await updatePackage(session, id, parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { id } = await params;
    await deletePackage(session, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
