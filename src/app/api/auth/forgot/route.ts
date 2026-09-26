import { requestReset } from "@/server/authFlows";
import { TOO_MANY_CODES, codeLimits, spend } from "@/server/rateLimit";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";

/** Sends a reset code by SMS or email. Never says whether the account exists. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier ?? "").trim();
  if (!identifier) return Response.json({ error: "Enter your email or phone number." }, { status: 400 });
  try {
    // Counted whether or not the account exists, so the limit reveals nothing.
    await spend(await codeLimits(identifier), TOO_MANY_CODES);
    return Response.json(await requestReset(identifier));
  } catch (err) {
    return errorResponse(err);
  }
}
