import { handleStkCallback, type StkCallbackBody } from "@/server/payments";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string; token: string }> };

/**
 * Safaricom's STK Push result callback. Always answer "accepted" once the body
 * parses — Safaricom retries anything else, and settlement is idempotent.
 */
export async function POST(request: Request, { params }: Params) {
  const { company, token } = await params;
  let body: StkCallbackBody = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: "Rejected: not JSON" }, { status: 400 });
  }
  const res = await handleStkCallback(company, token, body);
  if (!res.accepted) return Response.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
