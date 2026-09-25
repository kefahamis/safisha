import { timingSafeEqual } from "node:crypto";
import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { runBillingCycle } from "@/server/billing";

export const runtime = "nodejs";

/**
 * The scheduled billing job: raise this month's charges, then send reminders
 * for companies that turned them on. Call it daily from any scheduler with
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Set CRON_SECRET to enable the billing job." }, { status: 503 });

  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBillingCycle();
  await audit(SYSTEM_ACTOR, { action: "billing.cycle", detail: result });
  return Response.json(result);
}
