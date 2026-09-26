import { fleetBundle } from "@/server/fleet";
import { errorResponse, HttpError, requireSession } from "@/server/session";
import { visibleCompanies } from "@/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/**
 * The company's fleet: register, papers, checks, workshop, fuel, incidents and
 * driving totals; the reports are worked out from it in the browser. A driver
 * may fetch the slice for their own truck with `?truck=`.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSession();
    const truck = new URL(request.url).searchParams.get("truck") ?? undefined;

    const companies = await visibleCompanies(session);
    if (companies !== null && !companies.includes(company)) throw new HttpError(403, "That belongs to another company.");

    const manager = session.permissions.includes("fleet.manage");
    const ownTruck = Boolean(truck) && session.permissions.includes("fleet.inspect") && session.scope.truckId === truck;
    if (!manager && !ownTruck) throw new HttpError(403, "Missing permission: fleet.manage");

    const bundle = await fleetBundle(session, company, manager ? truck : session.scope.truckId);
    return Response.json(bundle, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
