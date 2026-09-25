import { liveMpesa } from "@/server/payments";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string; token: string }> };

/**
 * Safaricom's optional pre-payment validation. We accept every payment: one
 * with a mistyped account number lands in suspense for a person to match,
 * which beats bouncing a customer's money.
 */
export async function POST(_request: Request, { params }: Params) {
  const { company, token } = await params;
  const live = await liveMpesa(company);
  if (!live || token !== live.webhookToken) {
    return Response.json({ ResultCode: "C2B00016", ResultDesc: "Rejected" }, { status: 403 });
  }
  return Response.json({ ResultCode: "0", ResultDesc: "Accepted" });
}
