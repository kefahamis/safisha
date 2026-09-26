import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Photos and backups in Vercel Blob. The Blob SDK is replaced by an in-memory
 * store with the same calls, so this checks our side: everything is private,
 * reads go through the store, old database photos move across, and backups
 * are pruned to the newest fourteen.
 */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-storage-")), "db");
process.env.DEMO_DATA = "0";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const blobs = new Map<string, { bytes: Buffer; access: string; uploadedAt: Date }>();
let clock = Date.UTC(2026, 8, 1);

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer, opts: { access: string; addRandomSuffix?: boolean }) => {
    const name = opts.addRandomSuffix ? `${pathname}-${Math.random().toString(36).slice(2, 8)}` : pathname;
    blobs.set(name, { bytes: Buffer.from(body), access: opts.access, uploadedAt: new Date((clock += 60_000)) });
    return { pathname: name, url: `https://blob.example/${name}` };
  }),
  get: vi.fn(async (pathname: string, opts: { access: string }) => {
    const b = blobs.get(pathname);
    if (!b || b.access !== opts.access) return null;
    return { stream: new Blob([new Uint8Array(b.bytes)]).stream(), blob: { pathname } };
  }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...blobs.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([pathname, b]) => ({ pathname, size: b.bytes.length, uploadedAt: b.uploadedAt })),
  })),
  del: vi.fn(async (names: string[] | string) => {
    for (const n of [names].flat()) blobs.delete(n);
  }),
}));

const load = async () => ({
  ...(await import("@/server/db")),
  t: await import("@/server/db/schema"),
  storage: await import("@/server/storage"),
  backup: await import("@/server/backup"),
});
let m: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  m = await load();
  await m.getDb();
});

const read = async (body: BodyInit | null) => Buffer.from(await new Response(body).arrayBuffer());
const photo = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4]);

describe("photos", () => {
  it("stay in the database until Blob storage is connected", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const id = await m.storage.saveFile({ bytes: photo, mime: "image/jpeg", owner: "u1", company: "TS", id: "F-local" });
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.files).where(eq(m.t.files.id, id));
    expect(row).toMatchObject({ storage: "db", location: null, size: photo.length });
    expect(await read(await m.storage.openFile(row))).toEqual(photo);
  });

  it("go to Blob, privately, once it is", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const id = await m.storage.saveFile({ bytes: photo, mime: "image/jpeg", owner: "u1", company: "TS" });
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.files).where(eq(m.t.files.id, id));
    expect(row.storage).toBe("blob");
    expect(row.bytes).toBeNull();
    expect(blobs.get(row.location!)?.access).toBe("private");
    expect(await read(await m.storage.openFile(row))).toEqual(photo);
  });

  it("already in the database are moved across by the nightly job", async () => {
    const res = await m.storage.moveFilesToBlob(10);
    expect(res).toEqual({ moved: 1, more: false });
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.files).where(eq(m.t.files.id, "F-local"));
    expect(row).toMatchObject({ storage: "blob", bytes: null });
    expect(await read(await m.storage.openFile(row))).toEqual(photo);
  });
});

describe("nightly backups", () => {
  it("refuse to run without an encryption key", async () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    await expect(m.backup.runBackup()).rejects.toBeInstanceOf(m.backup.BackupUnavailable);
  });

  it("are stored privately, and only the newest fourteen are kept", async () => {
    process.env.BACKUP_ENCRYPTION_KEY = "11".repeat(32);
    for (let i = 0; i < 16; i++) await m.backup.runBackup();
    const kept = await m.backup.listBackups();
    expect(kept).toHaveLength(14);
    expect(kept.every((b) => blobs.get(b.pathname)?.access === "private")).toBe(true);
    // Newest first, and the two oldest are the ones that went.
    expect(kept[0].uploadedAt > kept[13].uploadedAt).toBe(true);
    const sealed = blobs.get(kept[0].pathname)!.bytes;
    expect(sealed.subarray(0, 7).toString()).toBe("ZOABAK1");
    expect(sealed.includes(Buffer.from("password_hash"))).toBe(false);
  });
});
