import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * A real deployment: demo data off, a fresh database, the first admin from the
 * environment. Nothing demo-shaped may appear, and nothing may pretend money
 * arrived.
 */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-fresh-")), "db");
process.env.DEMO_DATA = "0";
process.env.ADMIN_EMAIL = "Owner@Example.co.ke";
process.env.ADMIN_PASSWORD = "a-long-first-password";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const load = async () => ({
  ...(await import("@/server/db")),
  t: await import("@/server/db/schema"),
  reference: await import("@/server/reference"),
  payments: await import("@/server/payments"),
  limits: await import("@/server/rateLimit"),
  registry: await import("@/lib/reference/companies"),
  password: await import("@/server/password"),
});
let m: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  m = await load();
  await m.getDb();
});

const countOf = async (table: PgTable) => {
  const db = await m.getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return n;
};

describe("a fresh production database", () => {
  it("has the built-in roles but no demo companies, estates, clients or accounts", async () => {
    expect(await countOf(m.t.roles)).toBeGreaterThan(0);
    expect(await countOf(m.t.companies)).toBe(0);
    expect(await countOf(m.t.estates)).toBe(0);
    expect(await countOf(m.t.clients)).toBe(0);
    expect(await countOf(m.t.trucks)).toBe(0);
  });

  it("creates exactly one platform admin from the environment", async () => {
    const db = await m.getDb();
    const users = await db.select().from(m.t.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "owner@example.co.ke", roleId: "platform_admin" });
    expect(m.password.verifyPassword("a-long-first-password", users[0].passwordHash)).toBe(true);
    expect(m.password.verifyPassword("zoa12345", users[0].passwordHash)).toBe(false);
  });
});

describe("onboarding", () => {
  it("adds a company with starter departments, visible to every screen", async () => {
    const input = m.reference.CompanyBody.parse({ id: "nb", name: "Nairobi Bins", paybill: "512345", care: "0700 000 000", hours: "Daily", color: "#123456" });
    await m.reference.createCompany(input);
    expect(m.registry.companyById("NB").name).toBe("Nairobi Bins");
    const db = await m.getDb();
    const depts = await db.select().from(m.t.departments).where(eq(m.t.departments.company, "NB"));
    expect(depts.map((d) => d.name).sort()).toEqual(["Customer care", "Finance & billing", "Fleet & workshop", "Operations"]);
  });

  it("refuses a duplicate code or Paybill", async () => {
    await expect(m.reference.createCompany({ id: "NB", name: "Other", paybill: "", care: "", hours: "", color: "#000000" })).rejects.toThrow(/already/);
    await expect(m.reference.createCompany({ id: "OT", name: "Other", paybill: "512345", care: "", hours: "", color: "#000000" })).rejects.toThrow(/Paybill/);
  });

  it("validates codes and coordinates", () => {
    expect(m.reference.CompanyBody.safeParse({ id: "N1", name: "x", paybill: "", care: "", hours: "", color: "#000000" }).success).toBe(false);
    const estate = { code: "kil", name: "Kilimani", lat: -1.29, lng: 36.78, radius: 1400, days: [1, 4], company: "NB" };
    expect(m.reference.EstateBody.parse(estate).code).toBe("KIL");
    // Latitude and longitude swapped.
    expect(m.reference.EstateBody.safeParse({ ...estate, lat: 36.78, lng: -1.29 }).success).toBe(false);
    expect(m.reference.EstateBody.safeParse({ ...estate, days: [] }).success).toBe(false);
  });

  it("adds estates to a company and keeps estates with clients where they are", async () => {
    await m.reference.createEstate({ code: "KIL", name: "Kilimani", lat: -1.29, lng: 36.78, radius: 1400, days: [4, 1, 1], company: "NB" });
    expect(m.registry.companyById("NB").estates).toEqual(["KIL"]);

    const db = await m.getDb();
    await db.insert(m.t.clients).values({ id: "NB-KIL-01011", company: "NB", estate: "KIL", name: "Test", type: "Residential", plan: 500, phone: "0712 345 678", joined: "2026-09-01", lat: -1.29, lng: 36.78 });
    await expect(m.reference.updateEstate("KIL", { name: "Kilimani", lat: -1.29, lng: 36.78, radius: 1400, days: [1], company: null })).rejects.toThrow(/can't change hands/);
    await expect(m.reference.deleteEstate("KIL")).rejects.toThrow(/has clients/);
    await expect(m.reference.deleteCompany("NB")).rejects.toThrow(/has clients/);
  });
});

describe("payments without M-Pesa connected", () => {
  it("won't simulate a Paybill payment", async () => {
    const res = await m.payments.simulatePaybill("NB", { account: "NB-KIL-01011", amount: 500, phone: "0712345678" });
    expect(res.ok).toBe(false);
    expect(await countOf(m.t.txns)).toBe(0);
  });

  it("won't start a pretend STK prompt", async () => {
    const res = await m.payments.startStk({ company: "NB", client: "NB-KIL-01011", phone: "0712345678", amount: 500, purpose: "bill" });
    expect(res.ok).toBe(false);
    expect(await countOf(m.t.stkRequests)).toBe(0);
  });
});

describe("rate limits", () => {
  const limit = { max: 3, windowSec: 600 };

  it("allow the limit, then refuse, across instances", async () => {
    const checks: [string, typeof limit][] = [["test:a", limit]];
    for (let i = 0; i < 3; i++) await m.limits.spend(checks, "Slow down.");
    await expect(m.limits.spend(checks, "Slow down.")).rejects.toMatchObject({ status: 429 });
    await expect(m.limits.ensureNotLimited(checks, "Slow down.")).rejects.toMatchObject({ status: 429 });
  });

  it("forget a key once cleared, and start over when the window ends", async () => {
    await m.limits.clearLimit("test:a");
    expect(await m.limits.isLimited("test:a", limit)).toBeNull();

    for (let i = 0; i < 3; i++) await m.limits.hit("test:b", limit);
    const db = await m.getDb();
    await db.update(m.t.rateLimits).set({ resetAt: new Date(Date.now() - 1000) }).where(eq(m.t.rateLimits.key, "test:b"));
    expect((await m.limits.hit("test:b", limit)).hits).toBe(1);
  });
});
