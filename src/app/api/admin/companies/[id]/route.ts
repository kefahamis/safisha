import { audit } from "@/server/audit";
import { CompanyBody, deleteCompany, updateCompany } from "@/server/reference";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { id } = await params;
    // The code is fixed: it is part of every client number.
    const parsed = CompanyBody.omit({ id: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the details.");
    const company = await updateCompany(id, parsed.data);
    await audit(session, { action: "company.update", target: id, company: id, detail: { ...parsed.data } });
    return Response.json({ ok: true, company });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const { id } = await params;
    const company = await deleteCompany(id);
    await audit(session, { action: "company.delete", target: id, company: null, detail: { name: company.name } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
