import { requireCompanyBooks, reverseEntry } from "@/server/ledger";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string; entryId: string }> };

/** Reverse a manual entry by posting its mirror image. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { company, entryId } = await params;
    const session = await requirePermission("finance.journal");
    await requireCompanyBooks(session, company);
    const id = await reverseEntry(session, entryId);
    return Response.json({ id });
  } catch (err) {
    return errorResponse(err);
  }
}
