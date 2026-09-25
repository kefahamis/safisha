import { requestOtp } from "@/server/authFlows";

export const runtime = "nodejs";

/** Texts a one-time sign-in code to a registered phone. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone ?? "").trim();
  if (!phone) return Response.json({ error: "Enter your phone number." }, { status: 400 });
  return Response.json(await requestOtp(phone));
}
