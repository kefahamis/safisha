// Applies database migrations before the app is built, so a bad migration fails
// the deploy instead of the first request. Without DATABASE_URL (local builds on
// the embedded database) there is nothing to do: the app migrates PGlite itself.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The same key the app takes at start-up, so the two never migrate at once.
const MIGRATION_LOCK = 72_403_117;

// Netlify DB (Neon) provides NETLIFY_DATABASE_URL; anywhere else, DATABASE_URL.
const pooled = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!pooled) {
  console.log("migrate: no DATABASE_URL or NETLIFY_DATABASE_URL, skipping (the embedded database migrates at start-up).");
  process.exit(0);
}

// Migrations and the advisory lock need one real session, so this goes around
// the pooler: the direct URL if given, or Neon's pooled host without "-pooler".
const direct = process.env.DATABASE_URL
  ? process.env.DATABASE_URL_UNPOOLED
  : process.env.NETLIFY_DATABASE_URL_UNPOOLED;
const url = direct || pooled.replace(/-pooler\./, ".");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  // Up to 20 s, then carry on: a stranded lock mustn't block every deploy.
  let locked = false;
  for (let i = 0; i < 40 && !locked; i++) {
    [{ locked }] = await sql`select pg_try_advisory_lock(${MIGRATION_LOCK}) as locked`;
    if (!locked) await new Promise((r) => setTimeout(r, 500));
  }
  if (!locked) console.warn("migrate: the migration lock is held elsewhere; continuing without it.");
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("migrate: database is up to date.");
} catch (err) {
  console.error("migrate: failed.", err);
  process.exitCode = 1;
} finally {
  await sql`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => {});
  await sql.end();
}
