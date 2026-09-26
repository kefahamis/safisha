import { requestOtp } from "@/server/authFlows";
import { TOO_MANY_CODES, codeLimits, spend } from "@/server/rateLimit";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";

/** Texts a one-time sign-in code to a registered phone. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone ?? "").trim();
  if (!phone) return Response.json({ error: "Enter your phone number." }, { status: 400 });
  try {
    // Every code costs an SMS and opens five more guesses.
    await spend(await codeLimits(phone), TOO_MANY_CODES);
    return Response.json(await requestOtp(phone));
  } catch (err) {
    return errorResponse(err);
  }
}
