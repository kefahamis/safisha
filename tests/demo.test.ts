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
