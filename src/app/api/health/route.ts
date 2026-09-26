import { sql } from "drizzle-orm";
import { missingSettings } from "@/server/configError";
import { databaseUrl, DbSetupError, getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * For an uptime monitor (Better Stack, UptimeRobot): 200 when the app can
 * reach its database, 503 when it can't. A failure says which kind, so it can
 * be fixed without digging through logs: the database isn't configured, can't
 * be reached, or was reached but setting it up failed. Only categories, error
 * codes and the failing step are shown, never the connection string, host or
 * credentials; the full error goes to the function log.
 */

const headers = { "Cache-Control": "no-store" };
const release = () => (process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null;

type Failure = { reason: string; code?: string; stage?: string; detail?: string; fix: string };

/** The innermost error with a code: Postgres SQLSTATE (28P01) or a network code (ENOTFOUND). */
function rootCode(err: unknown): { code?: string; message?: string } {
  let e: unknown = err;
  let found: { code?: string; message?: string } = {};
  for (let i = 0; i < 6 && e; i++) {
    const x = e as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof x.code === "string") found = { code: x.code, message: typeof x.message === "string" ? x.message : undefined };
    e = x.cause;
  }
  return found;
}

/** A Postgres message is safe to show; strip anything shaped like a URL or a quoted secret just in case. */
const scrub = (m?: string) => m?.split("\n")[0].replace(/\b\w+:\/\/\S+/g, "[url]").slice(0, 160);

/** Why a connection can't be made, from its error code. */
function classifyConnect(code?: string): Failure {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return { reason: "unreachable", code, fix: "The database host name doesn't resolve. Check the host in the connection string; the database may have been deleted." };
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ECONNRESET":
    case "CONNECT_TIMEOUT":
      return { reason: "unreachable", code, fix: "The database host didn't accept the connection. Check it's running (a suspended Neon compute wakes on connect) and that the port is right." };
    case "28P01":
    case "28000":
      return { reason: "login-refused", code, fix: "The database rejected the username or password. Copy the connection string again from Neon or Netlify DB." };
    case "3D000":
      return { reason: "no-such-database", code, fix: "The database named in the connection string doesn't exist." };
    case "ERR_INVALID_URL":
    case "ERR_INVALID_ARG_TYPE":
      return { reason: "bad-connection-string", code, fix: "The connection string isn't a valid postgres:// URL." };
    default:
      return { reason: "cannot-connect", code, fix: "The connection failed; the function log has the full error." };
  }
}

/** Opens one connection on its own, to tell "can't connect" apart from "connected, but setup failed". */
async function probe(url: string): Promise<Failure | null> {
  try {
    new URL(url);
  } catch {
    return classifyConnect("ERR_INVALID_URL");
  }
  const { default: postgres } = await import("postgres");
  const client = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 1, onnotice: () => {} });
  try {
    await client`select 1`;
    return null;
  } catch (err) {
    return classifyConnect(rootCode(err).code);
  } finally {
    await client.end({ timeout: 1 }).catch(() => {});
  }
}

export async function GET() {
  const started = Date.now();
  const url = databaseUrl();
  const source = process.env.DATABASE_URL ? "DATABASE_URL" : process.env.NETLIFY_DATABASE_URL ? "NETLIFY_DATABASE_URL" : null;

  if (!url && process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    const failure: Failure = {
      reason: "not-configured",
      fix: "Neither DATABASE_URL nor NETLIFY_DATABASE_URL reaches the server. Set one in the site's environment variables with the Functions scope (not only Builds), then redeploy.",
    };
    return Response.json({ ok: false, db: "down", ...failure, release: release() }, { status: 503, headers });
  }

  // Settings the app can't do without; named, never shown.
  const missing = missingSettings();
  const settings = missing.length ? { missing: missing.map((m) => `${m.name}: ${m.effect}`) } : {};
  const signInBroken = missing.some((m) => m.name === "SESSION_SECRET");

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    if (signInBroken) {
      return Response.json(
        {
          ok: false,
          db: "up",
          reason: "not-configured",
          fix: "SESSION_SECRET doesn't reach the server. Set it in the site's environment variables with the Functions scope, then redeploy.",
          ...settings,
          source,
          release: release(),
        },
        { status: 503, headers },
      );
    }
    return Response.json({ ok: true, db: "up", ms: Date.now() - started, ...settings, source, release: release() }, { headers });
  } catch (err) {
    console.error("Health check failed", err);
    // Only now, on failure, open a separate connection to see which kind it is.
    const connectFailure = url ? await probe(url) : null;
    let failure: Failure;
    if (connectFailure) {
      failure = connectFailure;
    } else {
      const { code, message } = rootCode(err);
      failure = {
        reason: "setup-failed",
        stage: err instanceof DbSetupError ? err.stage : undefined,
        code,
        // Only a database error's own message: a query wrapper's message can carry the query's parameters.
        detail: scrub(message),
        fix: "The database is reachable but bringing it up failed at this stage. The function log has the full error.",
      };
    }
    return Response.json({ ok: false, db: "down", source, ...failure, release: release() }, { status: 503, headers });
  }
}
