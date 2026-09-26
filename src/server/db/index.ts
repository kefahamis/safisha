// Server-only. One database handle for the process.
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/*
 * PostgreSQL via Drizzle. With DATABASE_URL (or Netlify DB's NETLIFY_DATABASE_URL)
 * set, we connect to that server.
 * Without it (local development), we run PGlite — real Postgres compiled to
 * WebAssembly — in-process, stored under .data/pglite, so the app works with no
 * database to install. The schema and every query are the same for both.
 */

export type Db = ReturnType<typeof drizzlePostgres<typeof schema>>;

const GLOBAL_KEY = Symbol.for("zoa.db");

/** The connection, which version of the migrations list it was brought up to, and when the reference data was read. */
interface Handle {
  ready: Promise<Db>;
  journal: number;
  referenceAt?: number;
}

/** How long another instance's company or estate change may take to show here. */
const REFERENCE_TTL_MS = 30_000;

/** Postgres advisory lock key: one instance at a time migrates and seeds. */
const MIGRATION_LOCK = 72_403_117;

// Before handles carried a journal stamp, the global held the bare promise.
type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Handle | Promise<Db> };

// turbopackIgnore: these are read at run time; without it the build traces the whole project.
const MIGRATIONS = path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

/** Runs `fn` while holding the migration lock, so cold starts on several instances don't race. */
type Locker = (fn: () => Promise<void>) => Promise<void>;
const lockers = new WeakMap<Db, Locker>();

/** The Postgres to use: DATABASE_URL, or the one Netlify DB (Neon) provides. */
export const databaseUrl = () => process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || "";

/** Serverless platforms run many small instances; each keeps a small pool. */
const serverless = () => Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function connect(): Promise<Db> {
  const url = databaseUrl();

  if (url) {
    const { default: postgres } = await import("postgres");
    // Serverless instances each hold their own pool; keep it small there.
    const sql = postgres(url, { max: serverless() ? 5 : 10, onnotice: () => {} });
    const db = drizzlePostgres(sql, { schema });
    lockers.set(db, async (fn) => {
      // Session-level lock on one reserved connection; it is released if the instance dies.
      const conn = await sql.reserve();
      try {
        await conn`select pg_advisory_lock(${MIGRATION_LOCK})`;
        await fn();
      } finally {
        await conn`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => {});
        conn.release();
      }
    });
    return db;
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error(
      "DATABASE_URL (or Netlify DB's NETLIFY_DATABASE_URL) must be set in production, or ALLOW_EMBEDDED_DB=1 to use the embedded database.",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const dir = path.resolve(process.env.PGLITE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "pglite"));
  // PGlite creates its own folder but not missing parents.
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  // The query builders are the same; only the driver underneath differs.
  return drizzleLite(client, { schema }) as unknown as Db;
}

/** Which part of bringing the database up failed, for the health check. */
export type SetupStage = "migrate" | "roles" | "admin" | "demo" | "reference";

export class DbSetupError extends Error {
  constructor(
    readonly stage: SetupStage,
    readonly cause: unknown,
  ) {
    super(`Database setup failed at ${stage}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/**
 * Applies any migrations not yet run (normally already done by the build; see
 * scripts/migrate.mjs), makes sure the built-in roles and the first admin
 * exist, and in demo mode fills whatever demo data is missing.
 */
async function migrateAndSeed(db: Db) {
  let stage: SetupStage = "migrate";
  const run = async () => {
    if (databaseUrl()) {
      // The build has already migrated (scripts/migrate.mjs). If the host didn't
      // ship the migration files with the server, trust that rather than fail.
      if (existsSync(path.join(MIGRATIONS, "meta", "_journal.json"))) {
        const { migrate } = await import("drizzle-orm/postgres-js/migrator");
        await migrate(db, { migrationsFolder: MIGRATIONS });
      } else {
        console.warn(`Migrations not found at ${MIGRATIONS}; relying on the build's migration step.`);
      }
    } else {
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS });
    }
    stage = "roles";
    const { ensureSystemRoles, seedTeamIfEmpty } = await import("./teamSeed");
    await ensureSystemRoles(db);
    stage = "admin";
    const { bootstrapAdmin } = await import("./bootstrap");
    await bootstrapAdmin(db);

    stage = "demo";
    const { demoMode } = await import("../demo");
    if (demoMode()) {
      const { seedDemoIfEmpty } = await import("./seed");
      await seedDemoIfEmpty(db);
      await loadReference(db);
      // Separate, so databases seeded before fleet management still get its demo history.
      const { seedFleetIfEmpty } = await import("./fleetSeed");
      await seedFleetIfEmpty(db);
      await seedTeamIfEmpty(db);
    }
  };
  const lock = lockers.get(db);
  try {
    await (lock ? lock(run) : run());
    stage = "reference";
    await loadReference(db);
  } catch (err) {
    throw err instanceof DbSetupError ? err : new DbSetupError(stage, err);
  }
}

async function loadReference(db: Db) {
  const { loadReference: load } = await import("../reference");
  await load(db);
}

/** When the list of migrations last changed. */
function journalStamp(): number {
  try {
    return statSync(path.join(MIGRATIONS, "meta", "_journal.json")).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The shared database, connected, migrated and seeded on first use.
 *
 * In development the connection outlives code reloads, so a migration added
 * while the server runs would otherwise wait for a restart while the new code
 * already queries its columns. There, a changed migrations list brings the live
 * connection up to date before it's handed out.
 */
export function getDb(): Promise<Db> {
  const g = globalThis as GlobalWithDb;
  let h = g[GLOBAL_KEY];

  // A connection opened by code from before this reload: adopt it (PGlite must
  // not be opened twice) and check its migrations.
  if (h instanceof Promise) h = g[GLOBAL_KEY] = { ready: h, journal: -1 };

  if (!h) {
    const journal = journalStamp();
    const ready = connect().then(async (db) => {
      await migrateAndSeed(db);
      return db;
    });
    h = g[GLOBAL_KEY] = { ready, journal, referenceAt: Date.now() };
    ready.catch(() => {
      // Let the next request retry rather than caching a failed connection.
      if (g[GLOBAL_KEY] === h) delete g[GLOBAL_KEY];
    });
    return ready;
  }

  if (process.env.NODE_ENV !== "production") {
    const journal = journalStamp();
    if (journal !== h.journal) {
      const handle = h;
      const base = handle.ready;
      handle.journal = journal;
      handle.ready = base.then(async (db) => {
        await migrateAndSeed(db);
        return db;
      });
      // If it fails, keep the working connection and try again on the next request.
      handle.ready.catch(() => {
        handle.journal = -1;
        handle.ready = base;
      });
    }
  }

  // Companies and estates change rarely, but another instance may have changed them.
  if (Date.now() - (h.referenceAt ?? 0) > REFERENCE_TTL_MS) {
    const handle = h;
    const base = handle.ready;
    handle.referenceAt = Date.now();
    handle.ready = base.then(async (db) => {
      await loadReference(db).catch((err) => console.error("Could not refresh companies and estates", err));
      return db;
    });
  }
  return h.ready;
}

export { schema };
