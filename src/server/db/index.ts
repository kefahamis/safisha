// Server-only. One database handle for the process.
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/*
 * PostgreSQL via Drizzle. With DATABASE_URL set, we connect to that server.
 * Without it (local development), we run PGlite — real Postgres compiled to
 * WebAssembly — in-process, stored under .data/pglite, so the app works with no
 * database to install. The schema and every query are the same for both.
 */

export type Db = ReturnType<typeof drizzlePostgres<typeof schema>>;

const GLOBAL_KEY = Symbol.for("zoa.db");

/** The connection, and which version of the migrations list it was brought up to. */
interface Handle {
  ready: Promise<Db>;
  journal: number;
}

// Before handles carried a journal stamp, the global held the bare promise.
type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Handle | Promise<Db> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: postgres } = await import("postgres");
    // Serverless instances each hold their own pool; keep it small there.
    const sql = postgres(url, { max: process.env.VERCEL ? 5 : 10, onnotice: () => {} });
    return drizzlePostgres(sql, { schema });
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error(
      "DATABASE_URL must be set in production (or set ALLOW_EMBEDDED_DB=1 to use the embedded database).",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const dir = path.resolve(process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite"));
  // PGlite creates its own folder but not missing parents.
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  // The query builders are the same; only the driver underneath differs.
  return drizzleLite(client, { schema }) as unknown as Db;
}

/** Applies any migrations not yet run, then fills whatever demo data is missing. */
async function migrateAndSeed(db: Db) {
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS });
  }
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db);
  // Separate, so databases seeded before fleet management still get its demo history.
  const { seedFleetIfEmpty } = await import("./fleetSeed");
  await seedFleetIfEmpty(db);
  const { ensureSystemRoles, seedTeamIfEmpty } = await import("./teamSeed");
  await ensureSystemRoles(db);
  await seedTeamIfEmpty(db);
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
    h = g[GLOBAL_KEY] = { ready, journal };
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
  return h.ready;
}

export { schema };
