// Server-only. Where uploaded photos and logos live: Vercel Blob when connected, the database otherwise.
import { and, eq, isNotNull } from "drizzle-orm";
import { randomToken } from "./crypto";
import { getDb, schema } from "./db";

type FileRow = typeof schema.files.$inferSelect;

/**
 * Blob storage keeps photos out of Postgres, which would otherwise grow with
 * every proof of collection and slow every backup. Blobs are private: they're
 * only ever read here, after the same access check as before, and streamed on.
 * Without a Blob store (local development, or before one is connected) the
 * bytes stay in the database as they always have.
 */
export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

async function blobPut(id: string, bytes: Buffer, mime: string) {
  const { put } = await import("@vercel/blob");
  const res = await put(`files/${id}`, bytes, { access: "private", contentType: mime, addRandomSuffix: true });
  return res.pathname;
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

/** The file's bytes as a stream, wherever they're kept; null if they're gone. */
export async function openFile(file: FileRow): Promise<BodyInit | null> {
  if (file.storage === "blob" && file.location) {
    const { get } = await import("@vercel/blob");
    const res = await get(file.location, { access: "private" });
    return res?.stream ?? null;
  }
  return file.bytes ? new Uint8Array(file.bytes) : null;
}

/**
 * Moves files still held in the database into Blob storage, a batch at a time.
 * Runs with the nightly job once a Blob store is connected, until none are left.
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
