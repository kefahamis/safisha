import { handleC2BConfirmation, type C2BConfirmationBody } from "@/server/payments";

export const runtime = "nodejs";

type Params = { params: Promise<{ company: string; token: string }> };

/** Safaricom's Paybill (C2B) confirmation: the money has arrived. */
export async function POST(request: Request, { params }: Params) {
  const { company, token } = await params;
  let body: C2BConfirmationBody = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: "Rejected: not JSON" }, { status: 400 });
  }
  const res = await handleC2BConfirmation(company, token, body);
  if (!res.accepted) return Response.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
