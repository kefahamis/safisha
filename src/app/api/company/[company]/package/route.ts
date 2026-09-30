import { z } from "zod";
import { packageView, setCarePackage } from "@/server/packages";
import { errorResponse, HttpError } from "@/server/session";
import { requireSettingsScope } from "@/server/settingsAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** The company's care package, its Premium fee and what it's been charged. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { company } = await params;
    await requireSettingsScope(company);
    return Response.json(await packageView(company), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ package: z.enum(["basic", "premium"]) });

/** Upgrade to Premium (charged for this month at once) or go back to Basic. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSettingsScope(company);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Pick Basic or Premium.");
    return Response.json(await setCarePackage(session, company, parsed.data.package));
  } catch (err) {
    return errorResponse(err);
  }
}
