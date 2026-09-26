import { errorResponse, HttpError, requireSession } from "@/server/session";
import { DepartmentBody, deleteDepartment, requireTeam, saveDepartment } from "@/server/team";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string; id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { company, id } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    const parsed = DepartmentBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That department isn't complete.");
    return Response.json({ id: await saveDepartment(session, company, parsed.data, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { company, id } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    await deleteDepartment(session, company, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
