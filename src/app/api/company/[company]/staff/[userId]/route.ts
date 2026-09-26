import { z } from "zod";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { requireTeam, updateStaff } from "@/server/team";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string; userId: string }> };

const Body = z.object({
  departmentId: z.string().optional(),
  grants: z.array(z.string()).max(100).optional(),
  denies: z.array(z.string()).max(100).optional(),
  suspended: z.boolean().optional(),
});

/** Move a staff member between departments, adjust their own access, or suspend them. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { company, userId } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That change isn't valid.");
    await updateStaff(session, company, userId, parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
