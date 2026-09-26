// Server-only. Who may run a scheduled job.
import { timingSafeEqual } from "node:crypto";

/**
 * The Netlify scheduled functions (and any other scheduler) call with
 *   Authorization: Bearer <CRON_SECRET>
 * Returns a response to send back when the caller isn't allowed, or null.
 */
export function refuseCron(request: Request, job: string): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: `Set CRON_SECRET to enable the ${job} job.` }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
