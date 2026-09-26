import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For an uptime monitor (Better Stack, UptimeRobot): 200 when
 * the app can reach its database, 503 when it can't. Says nothing private.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json(
      { ok: true, db: "up", ms: Date.now() - started, release: (process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
