import { z } from "zod";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { inviteStaff, requireTeam } from "@/server/team";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string }> };

const Body = z.object({
  name: z.string().max(60),
  email: z.string().max(120),
  phone: z.string().max(20).optional(),
  departmentId: z.string(),
});

/** Invite a staff member into a department; they set their own password from the link. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Fill in the name, email and department.");
    const res = await inviteStaff(session, company, parsed.data);
    return Response.json({ emailed: res.emailed, link: res.link });
  } catch (err) {
    return errorResponse(err);
  }
}
