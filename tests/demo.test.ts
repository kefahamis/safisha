import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { trialBalance } from "@/lib/accounting";

/* Demo mode, kept for testing: the whole demo world, and a simulator that works. */

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "zoa-demo-")), "db");
process.env.DEMO_DATA = "1";
delete process.env.ADMIN_EMAIL;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const load = async () => ({
  ...(await import("@/server/db")),
  t: await import("@/server/db/schema"),
  payments: await import("@/server/payments"),
  ledger: await import("@/server/ledger"),
  companies: await import("@/lib/reference/companies"),
});
let m: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  m = await load();
  await m.getDb();
});

describe("the demo world", () => {
  it("seeds the demo companies, estates, clients and accounts", async () => {
    const db = await m.getDb();
    const [row] = await db.select({
      companies: sql<number>`(select count(*) from companies)::int`,
      estates: sql<number>`(select count(*) from estates)::int`,
      clients: sql<number>`(select count(*) from clients)::int`,
      admin: sql<number>`(select count(*) from users where email = 'admin@zoahub.co.ke')::int`,
      vehicles: sql<number>`(select count(*) from vehicles)::int`,
      departments: sql<number>`(select count(*) from departments)::int`,
    }).from(sql`(select 1) as one`);
    expect(row).toMatchObject({ companies: 3, estates: 10, admin: 1, departments: 12 });
    expect(row.clients).toBe(18);
    expect(row.vehicles).toBeGreaterThan(0);
    expect(m.companies.COMPANIES.map((c) => c.id).sort()).toEqual(["KW", "MZ", "TS"]);
  });

  it("keeps every company's books balanced", async () => {
    for (const c of m.companies.COMPANIES) {
      const tb = trialBalance(await m.ledger.companyJournal(c.id), "2099-12-31");
      expect(tb.balanced, `${c.name} trial balance`).toBe(true);
    }
  });

  it("lets the Paybill simulator record a payment against a client", async () => {
    const db = await m.getDb();
    const [client] = await db.select().from(m.t.clients).limit(1);
    const res = await m.payments.simulatePaybill(client.company, { account: client.id, amount: 250, phone: client.phone });
    expect(res).toMatchObject({ ok: true, mode: "simulated" });
    expect(res.receipt).toMatch(/^U[A-Z0-9]{9}$/);
  });
});

describe("getting started", () => {
  const view = async (userId: string) => {
    const { findUserById } = await import("@/server/accessStore");
    const { sessionForUser } = await import("@/server/session");
    const { onboardingView } = await import("@/server/onboarding");
    const user = (await findUserById(userId))!;
    const role = (await (await import("@/server/accessStore")).findRole(user.roleId))!;
    const session = await sessionForUser(user, { ws: role.workspace });
    return { user, session, view: await onboardingView(session, user) };
  };

  it("gives each kind of account its own steps", async () => {
    const keys = async (id: string) => (await view(id)).view.steps.map((s) => s.key);
    expect(await keys("u-platform")).toEqual(expect.arrayContaining(["sms", "email", "ai", "company", "package"]));
    expect(await keys("u-kw-admin")).toEqual(expect.arrayContaining(["mpesa", "client", "staff", "branding", "package"]));
    expect(await keys("u-ts-agent")).toEqual(expect.arrayContaining(["photo", "verifyEmail", "signature"]));
    expect(await keys("u-kiprop")).toEqual(expect.arrayContaining(["photo", "verifyPhone", "check"]));
    expect(await keys("u-grace")).toEqual(expect.arrayContaining(["verifyPhone", "verifyEmail", "pay"]));
  });

  it("ticks steps off from what's actually been done", async () => {
    const { view: admin } = await view("u-kw-admin");
    // The demo world already has Kijani's clients and staff.
    expect(admin.steps.find((s) => s.key === "client")?.done).toBe(true);
    expect(admin.steps.find((s) => s.key === "staff")?.done).toBe(true);
    const { view: platform } = await view("u-platform");
    expect(platform.steps.find((s) => s.key === "company")?.done).toBe(true);
    // Every step links somewhere the person can go.
    for (const s of [...admin.steps, ...platform.steps]) expect(s.href.startsWith("/")).toBe(true);
  });

  it("can be hidden and brought back", async () => {
    const { setOnboardingHidden } = await import("@/server/onboarding");
    await setOnboardingHidden("u-grace", true);
    expect((await view("u-grace")).view.hidden).toBe(true);
    await setOnboardingHidden("u-grace", false);
    expect((await view("u-grace")).view.hidden).toBe(false);
  });
});
