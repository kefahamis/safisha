import { z } from "zod";
import { packageView, setCompanyPackage } from "@/server/packages";
import { errorResponse, HttpError } from "@/server/session";
import { requireSettingsScope } from "@/server/settingsAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** The company's care package, what's on offer, and what it's been charged. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { company } = await params;
    await requireSettingsScope(company);
    return Response.json(await packageView(company), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** A package id to subscribe or switch to, or null to cancel. */
const Body = z.object({ package: z.string().max(40).nullable() });

/** Subscribe, switch (this month is charged at once) or cancel (this month stays paid). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSettingsScope(company);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Pick a package.");
    return Response.json(await setCompanyPackage(session, company, parsed.data.package));
  } catch (err) {
    return errorResponse(err);
  }
}
