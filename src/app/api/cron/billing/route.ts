import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { runBillingCycle } from "@/server/billing";
import { refuseCron } from "@/server/cron";

export const runtime = "nodejs";

/**
 * The scheduled billing job: raise this month's charges, then send reminders
 * for companies that turned them on. Vercel Cron runs it daily (vercel.json);
 * any other scheduler can call it with
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  const refused = refuseCron(request, "billing");
  if (refused) return refused;

  const result = await runBillingCycle();
  await audit(SYSTEM_ACTOR, { action: "billing.cycle", detail: result });
  return Response.json(result);
}

// Vercel Cron calls with GET (and the same Bearer CRON_SECRET header).
export const GET = POST;
