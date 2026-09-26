// Restores a nightly backup (see src/server/backup.ts) into a database.
//
//   BACKUP_ENCRYPTION_KEY=... DATABASE_URL=postgres://... node scripts/restore.mjs zoa-2026-09-26.bak --yes
//   BACKUP_ENCRYPTION_KEY=... node scripts/restore.mjs zoa-2026-09-26.bak --out backup.json   (just decrypt it)
//
// Download the file from Admin → Settings → Backups. Restore into a fresh
// database (a new Neon branch is ideal), check it, then point the app at it.
// The database is brought up to this release's migrations first; the backup
// must come from the same release, so that every column lines up.
import { createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MAGIC = Buffer.from("ZOABAK1");
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const fail = (msg) => {
  console.error(`restore: ${msg}`);
  process.exit(1);
};

if (!file) fail("give the backup file: node scripts/restore.mjs <file> --yes");
const hex = process.env.BACKUP_ENCRYPTION_KEY ?? "";
if (!/^[0-9a-fA-F]{64}$/.test(hex)) fail("set BACKUP_ENCRYPTION_KEY to the key the backup was made with.");

const sealed = readFileSync(file);
if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) fail("that isn't a Zoa backup file.");
const iv = sealed.subarray(MAGIC.length, MAGIC.length + 12);
const tag = sealed.subarray(MAGIC.length + 12, MAGIC.length + 28);
const decipher = createDecipheriv("aes-256-gcm", Buffer.from(hex, "hex"), iv);
decipher.setAuthTag(tag);
let backup;
try {
  const plain = Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + 28)), decipher.final()]);
  backup = JSON.parse(gunzipSync(plain).toString("utf8"));
} catch {
  fail("couldn't decrypt: wrong key, or the file is damaged.");
}

const counts = Object.entries(backup.tables).map(([name, rows]) => `${name} ${rows.length}`);
console.log(`restore: backup taken ${backup.takenAt} at migration ${backup.migration}`);
console.log(`restore: ${counts.join(", ")}`);

const out = option("out");
if (out) {
  writeFileSync(out, JSON.stringify(backup, null, 2));
  console.log(`restore: decrypted to ${out}`);
  process.exit(0);
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const release = journal.entries.at(-1)?.tag;
if (backup.migration !== release && !flag("force")) {
  fail(`the backup is from migration ${backup.migration} but this checkout is at ${release}. Check out the matching release, or pass --force.`);
}

const url = process.env.DATABASE_URL;
if (!url) fail("set DATABASE_URL to the database to restore into.");
if (!flag("yes")) fail("this replaces everything in that database. Run again with --yes to go ahead.");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  const existing = new Set(
    (await sql`select table_name from information_schema.tables where table_schema = 'public'`).map((r) => r.table_name),
  );
  const names = Object.keys(backup.tables).filter((n) => existing.has(n));
  const missing = Object.keys(backup.tables).filter((n) => !existing.has(n));
  if (missing.length) console.warn(`restore: skipping tables this release doesn't have: ${missing.join(", ")}`);

  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate ${names.map((n) => `"${n}"`).join(", ")}`);
    for (const name of names) {
      const rows = backup.tables[name];
      // In slices, so one enormous table doesn't make one enormous statement.
      for (let i = 0; i < rows.length; i += 2000) {
        const slice = JSON.stringify(rows.slice(i, i + 2000));
        await tx.unsafe(`insert into "${name}" select * from json_populate_recordset(null::"${name}", $1::json)`, [slice]);
      }
    }
    // Serial ids carry on after the highest restored one.
    const serials = await tx`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_default like 'nextval(%'`;
    for (const { table_name: t, column_name: c } of serials) {
      await tx.unsafe(
        `select setval(pg_get_serial_sequence('"${t}"', '${c}'), coalesce((select max("${c}") from "${t}"), 0) + 1, false)`,
      );
    }
  });
  console.log(`restore: done. ${names.length} tables restored.`);
} catch (err) {
  console.error("restore: failed; the data was left as it was.", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
