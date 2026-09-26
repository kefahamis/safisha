import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * What keeps the app correct and cheap as it grows: ids that concurrent
 * requests can't share, snapshots trimmed to each person's permissions, and
 * version tokens that let an unchanged poll skip the rebuild.
 */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-scale-")), "db");
process.env.DEMO_DATA = "1";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const load = async () => ({
  ...(await import("@/server/db")),
  t: await import("@/server/db/schema"),
  ids: await import("@/server/ids"),
  snapshot: await import("@/server/snapshot"),
  session: await import("@/server/session"),
  access: await import("@/server/accessStore"),
});
let m: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  m = await load();
  await m.getDb();
});

const sessionOf = async (email: string) => {
  const user = await m.access.findUserByEmail(email);
  if (!user) throw new Error(`no demo user ${email}`);
  return m.session.sessionForUser(user, { ws: "company" });
};

describe("ids", () => {
  it("never hands two concurrent requests the same number", async () => {
    const db = await m.getDb();
    const ids = await Promise.all(Array.from({ length: 25 }, () => m.ids.nextPrefixedId(db, m.t.tickets, "T-", 1045)));
    expect(new Set(ids).size).toBe(25);
  });

  it("carries on from ids written before the counter existed", async () => {
    const db = await m.getDb();
    await db.insert(m.t.pickupRequests).values({
      id: "P-9000",
      client: "x",
      company: "TS",
      kind: "bulky",
      notes: "",
      preferredDate: "2026-09-30",
      price: 0,
      status: "Requested",
      paid: false,
      createdAt: "2026-09-26 10:00",
    });
    expect(await m.ids.nextPrefixedId(db, m.t.pickupRequests, "P-", 3000)).toBe("P-9001");
    expect(await m.ids.nextPrefixedId(db, m.t.pickupRequests, "P-", 3000)).toBe("P-9002");
  });

  it("gives concurrent new clients in one estate different numbers", async () => {
    const db = await m.getDb();
    const seqs = await Promise.all(Array.from({ length: 15 }, () => m.ids.nextClientSeq(db, "TSKIL")));
    expect(new Set(seqs).size).toBe(15);
  });
});

describe("what each person receives", () => {
  it("gives the company admin everything", async () => {
    const snap = await m.snapshot.buildSnapshot(await sessionOf("ops@takasafi.co.ke"));
    expect(snap.clients.length).toBeGreaterThan(0);
    expect(snap.clients.every((c) => c.phone)).toBe(true);
    expect(snap.txns.length).toBeGreaterThan(0);
    expect(snap.tickets.length).toBeGreaterThan(0);
  });

  it("keeps phone numbers, money and the care inbox away from the workshop", async () => {
    const workshop = await sessionOf("workshop@takasafi.co.ke");
    expect(workshop.permissions).toContain("fleet.manage");
    const snap = await m.snapshot.buildSnapshot(workshop);
    expect(snap.trucks.length).toBeGreaterThan(0);
    expect(snap.clients.length).toBeGreaterThan(0);
    expect(snap.clients.every((c) => c.phone === "" && c.plan === 0)).toBe(true);
    expect(snap.txns).toHaveLength(0);
    expect(snap.tickets).toHaveLength(0);
    expect(snap.suspense).toHaveLength(0);
  });

  it("gives finance the books but not the care inbox", async () => {
    const snap = await m.snapshot.buildSnapshot(await sessionOf("accounts@takasafi.co.ke"));
    expect(snap.txns.length).toBeGreaterThan(0);
    expect(snap.tickets).toHaveLength(0);
  });

  it("gives someone with no permissions nothing about clients", async () => {
    const user = (await m.access.findUserByEmail("workshop@takasafi.co.ke"))!;
    const bare = await m.session.sessionForUser({ ...user, scope: { companyId: "TS" }, grants: [] }, { ws: "company" });
    expect(bare.permissions).toEqual([]);
    const snap = await m.snapshot.buildSnapshot(bare);
    expect(snap.clients).toHaveLength(0);
    expect(snap.txns).toHaveLength(0);
    expect(snap.pickups).toHaveLength(0);
    expect(snap.dumpReports).toHaveLength(0);
  });
});

describe("version tokens", () => {
  it("stay the same while nothing changes", async () => {
    const s = await sessionOf("ops@takasafi.co.ke");
    expect(await m.snapshot.snapshotVersion(s)).toBe(await m.snapshot.snapshotVersion(s));
    expect((await m.snapshot.buildSnapshot(s)).version).toBe(await m.snapshot.snapshotVersion(s));
  });

  it("move for the company that changed, and only that company", async () => {
    const ts = await sessionOf("ops@takasafi.co.ke");
    const kw = await sessionOf("ops@kijaniwaste.co.ke");
    const [tsBefore, kwBefore] = [await m.snapshot.snapshotVersion(ts), await m.snapshot.snapshotVersion(kw)];

    const db = await m.getDb();
    const [client] = await db.select().from(m.t.clients).where(eq(m.t.clients.company, "TS")).limit(1);
    await db.insert(m.t.txns).values({ id: "VER-1", client: client.id, date: "2026-09-26 10:00", kind: "payment", amount: 1, desc: "t" });

    expect(await m.snapshot.snapshotVersion(ts)).not.toBe(tsBefore);
    expect(await m.snapshot.snapshotVersion(kw)).toBe(kwBefore);
  });

  it("don't move for a client when another client of the company pays", async () => {
    const db = await m.getDb();
    const [a, b] = await db.select().from(m.t.clients).where(eq(m.t.clients.company, "TS")).limit(2);
    const user = (await m.access.findUserByEmail("wanjiku@example.com"))!;
    const me = await m.session.sessionForUser({ ...user, scope: { clientId: a.id } }, { ws: "client" });
    const before = await m.snapshot.snapshotVersion(me);

    await db.insert(m.t.txns).values({ id: "VER-2", client: b.id, date: "2026-09-26 10:00", kind: "payment", amount: 1, desc: "t" });
    expect(await m.snapshot.snapshotVersion(me)).toBe(before);

    // Their company's trucks are on their screen, so a truck moving does count.
    await db.update(m.t.trucks).set({ speed: 9 }).where(eq(m.t.trucks.company, "TS"));
    expect(await m.snapshot.snapshotVersion(me)).not.toBe(before);
  });

  it("move when a person's permissions change", async () => {
    const s = await sessionOf("accounts@takasafi.co.ke");
    const before = await m.snapshot.snapshotVersion(s);
    const changed = { ...s, permissions: [...s.permissions, "tickets.view.company"] };
    expect(await m.snapshot.snapshotVersion(changed)).not.toBe(before);
  });
});

describe("backups", () => {
  it("round-trip every table through encryption and json_populate_recordset", async () => {
    const { createDecipheriv, randomBytes } = await import("node:crypto");
    const { gunzipSync } = await import("node:zlib");
    const { sql } = await import("drizzle-orm");
    const backup = await import("@/server/backup");
    const db = await m.getDb();

    // A stored photo, so bytea is covered too.
    await db.insert(m.t.files).values({ id: "F-backup", mime: "image/png", bytes: Buffer.from([137, 80, 78, 71, 0, 255]), storage: "db", owner: "u", company: "TS" });

    const data = await backup.exportDatabase();
    const names = Object.keys(data.tables);
    expect(names).toContain("clients");
    expect(names).not.toContain("rate_limits");
    expect(data.migration).toMatch(/^\d{4}_/);

    // Sealed with the key; only the key opens it. Same layout scripts/restore.mjs reads.
    const key = randomBytes(32);
    const sealed = backup.sealBackup(data, key);
    const open = (k: Buffer) => {
      const d = createDecipheriv("aes-256-gcm", k, sealed.subarray(7, 19));
      d.setAuthTag(sealed.subarray(19, 35));
      return JSON.parse(gunzipSync(Buffer.concat([d.update(sealed.subarray(35)), d.final()])).toString("utf8"));
    };
    expect(() => open(randomBytes(32))).toThrow();
    const restored = open(key) as typeof data;

    const counts = async () => {
      const out: Record<string, number> = {};
      for (const n of names) {
        const r = await db.execute(sql`select count(*)::int as n from ${sql.identifier(n)}`);
        out[n] = ((Array.isArray(r) ? r : (r as { rows: { n: number }[] }).rows) as { n: number }[])[0].n;
      }
      return out;
    };
    const before = await counts();
    const [photoBefore] = await db.select().from(m.t.files).where(eq(m.t.files.id, "F-backup"));
    const [userBefore] = await db.select().from(m.t.users).where(eq(m.t.users.email, "ops@takasafi.co.ke"));

    // What the restore script does, on this database.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`truncate ${names.map((n) => `"${n}"`).join(", ")}`));
      for (const n of names) {
        const rows = JSON.stringify((restored.tables as Record<string, unknown[]>)[n]);
        await tx.execute(sql`insert into ${sql.identifier(n)} select * from json_populate_recordset(null::${sql.identifier(n)}, ${rows}::json)`);
      }
    });

    expect(await counts()).toEqual(before);
    const [photoAfter] = await db.select().from(m.t.files).where(eq(m.t.files.id, "F-backup"));
    expect(Buffer.compare(photoAfter.bytes!, photoBefore.bytes!)).toBe(0);
    const [userAfter] = await db.select().from(m.t.users).where(eq(m.t.users.email, "ops@takasafi.co.ke"));
    expect(userAfter).toEqual(userBefore);
  });
});
