import { z } from "zod";
import { postEntry, requireCompanyBooks } from "@/server/ledger";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

const Body = z.object({
  date: z.string(),
  memo: z.string().max(200),
  reference: z.string().max(60).optional(),
  lines: z
    .array(
      z.object({
        account: z.string(),
        debit: z.number().int().min(0),
        credit: z.number().int().min(0),
        memo: z.string().max(120).optional(),
      }),
    )
    .min(2)
    .max(40),
});

/** Post a manual journal entry. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requirePermission("finance.journal");
    await requireCompanyBooks(session, company);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That entry isn't complete.");
    const id = await postEntry(session, company, parsed.data);
    return Response.json({ id });
  } catch (err) {
    return errorResponse(err);
  }
}
