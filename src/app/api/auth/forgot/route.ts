import { requestReset } from "@/server/authFlows";

export const runtime = "nodejs";

/** Sends a reset code by SMS or email. Never says whether the account exists. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier ?? "").trim();
  if (!identifier) return Response.json({ error: "Enter your email or phone number." }, { status: 400 });
  return Response.json(await requestReset(identifier));
}
