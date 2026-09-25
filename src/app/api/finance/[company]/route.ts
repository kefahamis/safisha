import { companyJournal, requireCompanyBooks } from "@/server/ledger";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** The company's whole journal; the reports are worked out from it in the browser. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requirePermission("finance.view");
    await requireCompanyBooks(session, company);
    const entries = await companyJournal(company);
    return Response.json(
      { company, entries, canPost: session.permissions.includes("finance.journal") },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
