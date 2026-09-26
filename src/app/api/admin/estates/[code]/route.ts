import { audit } from "@/server/audit";
import { EstateBody, deleteEstate, updateEstate } from "@/server/reference";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { code } = await params;
    // The code is fixed: it is part of every client number.
    const parsed = EstateBody.omit({ code: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the details.");
    const estate = await updateEstate(code, parsed.data);
    await audit(session, { action: "estate.update", target: code, company: estate.company, detail: { ...parsed.data } });
    return Response.json({ ok: true, estate });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { code } = await params;
    const estate = await deleteEstate(code);
    await audit(session, { action: "estate.delete", target: code, company: estate.company, detail: { name: estate.name } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
