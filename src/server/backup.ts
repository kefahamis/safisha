// Server-only. Nightly encrypted exports of the database, kept in Blob storage.
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { blobConfigured } from "./storage";
import { today } from "./time";

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
export const BACKUP_PREFIX = "backups/";
const KEEP = 14;
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
  for (const name of tableNames()) {
    const res = await db.execute(sql`select coalesce(json_agg(t), '[]'::json)::text as j from ${sql.identifier(name)} t`);
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { j: string }[];
    tables[name] = JSON.parse(rows[0].j);
  }
  const journal = JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  return {
    format: 1,
    takenAt: new Date().toISOString(),
    migration: journal.entries.at(-1)?.tag ?? null,
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

export async function listBackups() {
  if (!blobConfigured()) return [];
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BACKUP_PREFIX, limit: 1000 });
  return blobs
    .map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt.toISOString() }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export class BackupUnavailable extends Error {}

/** Takes a backup now, stores it, and drops all but the newest KEEP. */
export async function runBackup() {
  const key = backupKey();
  if (!key) throw new BackupUnavailable("Set BACKUP_ENCRYPTION_KEY (64 hex characters) to turn on backups.");
  if (!blobConfigured()) throw new BackupUnavailable("Connect a Vercel Blob store to keep backups.");

  const data = await exportDatabase();
  const sealed = sealBackup(data, key);
  const { put, del } = await import("@vercel/blob");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saved = await put(`${BACKUP_PREFIX}zoa-${today()}-${stamp}.bak`, sealed, {
    access: "private",
    contentType: "application/octet-stream",
    addRandomSuffix: true,
  });

  const all = await listBackups();
  const old = all.slice(KEEP).map((b) => b.pathname);
  if (old.length) await del(old);

  const rows = Object.values(data.tables).reduce<number>((n, rs) => n + (rs as unknown[]).length, 0);
  return { pathname: saved.pathname, bytes: sealed.length, tables: Object.keys(data.tables).length, rows, pruned: old.length };
}
