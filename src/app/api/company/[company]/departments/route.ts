import { errorResponse, HttpError, requireSession } from "@/server/session";
import { DepartmentBody, requireTeam, saveDepartment } from "@/server/team";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    const parsed = DepartmentBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That department isn't complete.");
    return Response.json({ id: await saveDepartment(session, company, parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
