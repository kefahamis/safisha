/**
 * Netlify scheduled functions can't run the app's code directly (it lives in
 * the Next.js server), so each schedule calls the matching /api/cron route on
 * the site, with the same Bearer CRON_SECRET any other scheduler would use.
 * The job's own result and errors are logged by the route (and reach Sentry).
 */
export async function triggerCron(job: "billing" | "maintenance") {
  const base = process.env.URL; // the site's main address, set by Netlify
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(`cron ${job}: URL and CRON_SECRET must be set; skipped.`);
    return new Response("not configured", { status: 503 });
  }
  const started = Date.now();
  const res = await fetch(`${base}/api/cron/${job}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`cron ${job}: HTTP ${res.status} in ${Date.now() - started} ms: ${body.slice(0, 500)}`);
  if (!res.ok) throw new Error(`cron ${job} failed with HTTP ${res.status}`);
  return new Response(body, { status: 200 });
}
