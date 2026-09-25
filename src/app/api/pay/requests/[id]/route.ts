import { stkStatus } from "@/server/payments";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** How an STK Push request is going: pending, success or failed. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const req = await stkStatus(decodeURIComponent(id));
    if (!req) return Response.json({ error: "No such request." }, { status: 404 });

    const companies = await visibleCompanies(session);
    const allowed =
      session.ws === "client"
        ? session.scope.clientId === req.client
        : companies === null || companies.includes(req.company);
    if (!allowed) return Response.json({ error: "No such request." }, { status: 404 });

    return Response.json({
      id: req.id,
      status: req.status,
      mode: req.mode,
      amount: req.amount,
      receipt: req.receipt,
      resultCode: req.resultCode,
      resultDesc: req.resultDesc,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
