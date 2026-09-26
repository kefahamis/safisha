// Server-only. Where uploaded photos and logos live: Netlify Blobs when available, the database otherwise.
import type { Store } from "@netlify/blobs";
import { and, eq, isNotNull } from "drizzle-orm";
import { randomToken } from "./crypto";
import { getDb, schema } from "./db";

type FileRow = typeof schema.files.$inferSelect;

/**
 * Blob storage keeps photos out of Postgres, which would otherwise grow with
 * every proof of collection and slow every backup. Netlify Blobs are private:
 * they're only ever read here, after the same access check as before, and
 * streamed on. On Netlify the stores are available with no setup; elsewhere
 * (local development) the bytes stay in the database as they always have,
 * unless NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN point at a site's stores.
 */
export function blobConfigured() {
  const g = globalThis as { netlifyBlobsContext?: string };
  return Boolean(
    g.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT || (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN),
  );
}

/** One of the site's blob stores: "files" for photos and logos, "backups" for database backups. */
export async function blobStore(name: "files" | "backups"): Promise<Store> {
  const { getStore } = await import("@netlify/blobs");
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  // Strong consistency: a photo is read back moments after it's uploaded.
  return siteID && token ? getStore({ name, siteID, token, consistency: "strong" }) : getStore({ name, consistency: "strong" });
}

async function blobPut(id: string, bytes: Buffer, mime: string) {
  const store = await blobStore("files");
  // A fresh key per write, so a retry never overwrites anything.
  const key = `${id}-${randomToken(6)}`;
  await store.set(key, new Blob([new Uint8Array(bytes)], { type: mime }), { metadata: { mime } });
  return key;
}

/** Stores a file and returns its id. */
export async function saveFile(input: { bytes: Buffer; mime: string; owner: string; company: string | null; id?: string }) {
  const id = input.id ?? `F-${randomToken(12)}`;
  const db = await getDb();
  if (blobConfigured()) {
    const location = await blobPut(id, input.bytes, input.mime);
    await db.insert(schema.files).values({ id, mime: input.mime, bytes: null, storage: "blob", location, size: input.bytes.length, owner: input.owner, company: input.company });
  } else {
    await db.insert(schema.files).values({ id, mime: input.mime, bytes: input.bytes, storage: "db", size: input.bytes.length, owner: input.owner, company: input.company });
  }
  return id;
}

/** The file's bytes, wherever they're kept; null if they're gone. */
export async function openFile(file: FileRow): Promise<BodyInit | null> {
  if (file.storage === "blob" && file.location) {
    const store = await blobStore("files");
    return (await store.get(file.location, { type: "stream" })) ?? null;
  }
  return file.bytes ? new Uint8Array(file.bytes) : null;
}

/**
 * Moves files still held in the database into blob storage, a batch at a time.
 * Runs with the nightly job once blob storage is available, until none are left.
 */
export async function moveFilesToBlob(limit = 50) {
  if (!blobConfigured()) return { moved: 0, more: false };
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.storage, "db"), isNotNull(schema.files.bytes)))
    .limit(limit);
  let moved = 0;
  for (const row of rows) {
    const location = await blobPut(row.id, row.bytes!, row.mime);
    await db.update(schema.files).set({ storage: "blob", location, bytes: null, size: row.bytes!.length }).where(eq(schema.files.id, row.id));
    moved++;
  }
  return { moved, more: rows.length === limit };
}
