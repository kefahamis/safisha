import { trackDay, trackedDays } from "@/server/fleet";
import { errorResponse, HttpError, requirePermission } from "@/server/session";
import { getDb, schema } from "@/server/db";
import { visibleCompanies } from "@/server/snapshot";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** One truck's recorded day, for trip playback: `?truck=KDA 412X&day=2026-09-25`. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requirePermission("fleet.manage");
    const companies = await visibleCompanies(session);
    if (companies !== null && !companies.includes(company)) throw new HttpError(403, "That belongs to another company.");

    const url = new URL(request.url);
    const truck = url.searchParams.get("truck") ?? "";
    const db = await getDb();
    const [row] = await db.select().from(schema.trucks).where(eq(schema.trucks.id, truck));
    if (!row || row.company !== company) throw new HttpError(404, "No such truck.");

    const days = await trackedDays(truck);
    const day = url.searchParams.get("day") || days[0];
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ days, track: null });
    return Response.json({ days, track: await trackDay(company, truck, day) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
