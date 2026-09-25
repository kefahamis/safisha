// Server-only. One database handle for the process.
import { mkdirSync } from "node:fs";
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
type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Promise<Db> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: postgres } = await import("postgres");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const sql = postgres(url, { max: 10, onnotice: () => {} });
    const db = drizzlePostgres(sql, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error(
      "DATABASE_URL must be set in production (or set ALLOW_EMBEDDED_DB=1 to use the embedded database).",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.resolve(process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite"));
  // PGlite creates its own folder but not missing parents.
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzleLite(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // The query builders are the same; only the driver underneath differs.
  return db as unknown as Db;
}

async function init(): Promise<Db> {
  const db = await connect();
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db);
  return db;
}

/** The shared database, connected, migrated and seeded on first use. */
export function getDb(): Promise<Db> {
  const g = globalThis as GlobalWithDb;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = init().catch((err) => {
      // Let the next request retry rather than caching a failed connection.
      delete g[GLOBAL_KEY];
      throw err;
    });
  }
  return g[GLOBAL_KEY];
}

export { schema };
