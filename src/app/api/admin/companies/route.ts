import { audit } from "@/server/audit";
import { CompanyBody, createCompany, referenceOverview } from "@/server/reference";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every company and estate, with what hangs off each. */
export async function GET() {
  try {
    await requirePermission("platform.companies.manage");
    return Response.json(await referenceOverview());
  } catch (err) {
    return errorResponse(err);
  }
}

/** Onboards a licensed company, with starter departments. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const parsed = CompanyBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the details.");
    const company = await createCompany(parsed.data);
    await audit(session, { action: "company.create", target: company.id, company: company.id, detail: { ...company } });
    return Response.json({ ok: true, company });
  } catch (err) {
    return errorResponse(err);
  }
}
