import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Photos and backups in Netlify Blobs. The SDK is replaced by an in-memory
 * store with the same calls, so this checks our side: reads go through the
 * store, old database photos move across, and backups are pruned to the
 * newest fourteen. (Netlify Blobs are private to the site; there's no public URL.)
 */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-storage-")), "db");
process.env.DEMO_DATA = "0";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const stores = new Map<string, Map<string, { bytes: Buffer; metadata: Record<string, unknown> }>>();
const storeOf = (name: string) => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name)!;
};

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn((opts: { name: string; consistency?: string }) => {
    const data = storeOf(opts.name);
    return {
      set: async (key: string, body: Blob, o: { metadata?: Record<string, unknown> } = {}) => {
        data.set(key, { bytes: Buffer.from(await body.arrayBuffer()), metadata: o.metadata ?? {} });
        return { modified: true };
      },
      get: async (key: string, o: { type?: string } = {}) => {
        const b = data.get(key);
        if (!b) return null;
        return o.type === "stream" ? new Blob([new Uint8Array(b.bytes)]).stream() : b.bytes.toString();
      },
      getMetadata: async (key: string) => (data.has(key) ? { etag: "e", metadata: data.get(key)!.metadata } : null),
      list: async () => ({ blobs: [...data.keys()].map((key) => ({ key, etag: "e" })), directories: [] }),
      delete: async (key: string) => {
        data.delete(key);
      },
    };
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
  it("stay in the database where blob storage isn't available", async () => {
    delete process.env.NETLIFY_BLOBS_CONTEXT;
    const id = await m.storage.saveFile({ bytes: photo, mime: "image/jpeg", owner: "u1", company: "TS", id: "F-local" });
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.files).where(eq(m.t.files.id, id));
    expect(row).toMatchObject({ storage: "db", location: null, size: photo.length });
    expect(await read(await m.storage.openFile(row))).toEqual(photo);
  });

  it("go to blob storage once the server can reach it", async () => {
    // What Netlify sets inside its functions.
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: "s", token: "t" })).toString("base64");
    const id = await m.storage.saveFile({ bytes: photo, mime: "image/jpeg", owner: "u1", company: "TS" });
    const db = await m.getDb();
    const [row] = await db.select().from(m.t.files).where(eq(m.t.files.id, id));
    expect(row.storage).toBe("blob");
    expect(row.bytes).toBeNull();
    expect(storeOf("files").get(row.location!)?.metadata).toEqual({ mime: "image/jpeg" });
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

  it("are stored encrypted, and only the newest fourteen are kept", async () => {
    process.env.BACKUP_ENCRYPTION_KEY = "11".repeat(32);
    const names: string[] = [];
    for (let i = 0; i < 16; i++) {
      names.push((await m.backup.runBackup()).name);
      await new Promise((r) => setTimeout(r, 2));
    }
    const kept = await m.backup.listBackups();
    expect(kept).toHaveLength(14);
    // Newest first, and the two oldest are the ones that went.
    expect(kept.map((b) => b.name)).toEqual(names.slice(2).reverse());
    expect(kept[0].size).toBeGreaterThan(0);
    expect(m.backup.isBackupName(kept[0].name)).toBe(true);
    expect(m.backup.isBackupName("../files/F-1")).toBe(false);
    const sealed = storeOf("backups").get(kept[0].name)!.bytes;
    expect(sealed.subarray(0, 7).toString()).toBe("ZOABAK1");
    expect(sealed.includes(Buffer.from("password_hash"))).toBe(false);
  });
});
