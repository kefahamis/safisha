import { createPackage, listPackages, PackageBody, packageSubscribers } from "@/server/packages";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole catalogue, retired packages included, with how many companies are on each. */
export async function GET() {
  try {
    await requirePermission("platform.companies.manage");
    return Response.json({ packages: await listPackages({ includeRetired: true }), subscribers: await packageSubscribers() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const parsed = PackageBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the package details.");
    return Response.json({ package: await createPackage(session, parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
