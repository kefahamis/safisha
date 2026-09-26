// Server-only. Nightly encrypted exports of the database, kept in Netlify Blobs.
import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { blobConfigured, blobStore } from "./storage";

/*
 * Neon keeps point-in-time history (restore to any second in the retention
 * window, from its console); that is the first line of defence. These exports
 * are the second: a copy outside Neon, taken nightly, that survives a deleted
 * project or a mistake noticed after the retention window.
 *
 * Each table is exported by Postgres itself as JSON (json_agg), so every type
 * round-trips exactly through json_populate_recordset on restore
 * (scripts/restore.mjs). The file is gzipped, then encrypted with AES-256-GCM
 * under BACKUP_ENCRYPTION_KEY: it holds password hashes and client details, and
 * the key must be kept somewhere other than this deployment.
 */

/** Kept out: short-lived codes and counters that mean nothing after a restore. */
const SKIP = new Set(["auth_codes", "rate_limits", "data_versions"]);
const KEEP = 14;
/** Backup names sort by when they were taken: zoa-2026-09-26T23-30-00-000Z.bak */
const NAME = /^zoa-[0-9TZ-]+\.bak$/;
export const isBackupName = (name: string) => NAME.test(name);
const MAGIC = Buffer.from("ZOABAK1");

export const backupKey = (): Buffer | null => {
  const hex = process.env.BACKUP_ENCRYPTION_KEY ?? "";
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
};

function tableNames() {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((tbl) => getTableName(tbl))
    .filter((name) => !SKIP.has(name))
    .sort();
}

/** Every table as JSON text, keyed by name, with the migration it was taken at. */
export async function exportDatabase() {
  const db = await getDb();
  const tables: Record<string, unknown> = {};
  const rowsOf = <T>(res: unknown) => (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as T[];
  for (const name of tableNames()) {
    const res = await db.execute(sql`select coalesce(json_agg(t), '[]'::json)::text as j from ${sql.identifier(name)} t`);
    tables[name] = JSON.parse(rowsOf<{ j: string }>(res)[0].j);
  }
  // The release, as the database records it: the restore script matches it to a migration.
  const [applied] = rowsOf<{ at: string | number | null }>(
    await db.execute(sql`select max(created_at) as at from drizzle.__drizzle_migrations`),
  );
  return {
    format: 1,
    takenAt: new Date().toISOString(),
    migratedAt: applied?.at === null || applied?.at === undefined ? null : Number(applied.at),
    tables,
  };
}

/** gzip, then AES-256-GCM: MAGIC | iv(12) | tag(16) | ciphertext. */
export function sealBackup(data: unknown, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(data)))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** The stored backups, newest first. */
export async function listBackups() {
  if (!blobConfigured()) return [];
  const store = await blobStore("backups");
  const { blobs } = await store.list();
  const names = blobs
    .map((b) => b.key)
    .filter(isBackupName)
    .sort()
    .reverse();
  return Promise.all(
    names.map(async (name) => {
      const meta = (await store.getMetadata(name))?.metadata ?? {};
      return { name, size: Number(meta.size ?? 0), takenAt: String(meta.takenAt ?? "") };
    }),
  );
}

export class BackupUnavailable extends Error {}

/** Takes a backup now, stores it, and drops all but the newest KEEP. */
export async function runBackup() {
  const key = backupKey();
  if (!key) throw new BackupUnavailable("Set BACKUP_ENCRYPTION_KEY (64 hex characters) to turn on backups.");
  if (!blobConfigured()) throw new BackupUnavailable("Backups are kept in Netlify Blobs, which this server can't reach.");

  const data = await exportDatabase();
  const sealed = sealBackup(data, key);
  const store = await blobStore("backups");
  const name = `zoa-${data.takenAt.replace(/[:.]/g, "-")}.bak`;
  await store.set(name, new Blob([new Uint8Array(sealed)]), { metadata: { size: sealed.length, takenAt: data.takenAt } });

  const old = (await listBackups()).slice(KEEP).map((b) => b.name);
  for (const n of old) await store.delete(n);

  const rows = Object.values(data.tables).reduce<number>((n, rs) => n + (rs as unknown[]).length, 0);
  return { name, bytes: sealed.length, tables: Object.keys(data.tables).length, rows, pruned: old.length };
}
