import { errorResponse, requireSession } from "@/server/session";
import { requireTeam, teamBundle } from "@/server/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** The company's departments and staff, and what this admin may hand out. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSession();
    await requireTeam(session, company);
    return Response.json(await teamBundle(session, company), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
