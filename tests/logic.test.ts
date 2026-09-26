import { describe, expect, it } from "vitest";
import { trialBalance, validateLines, type JournalEntry } from "@/lib/accounting";
import { luhn, nextClientNumber, normalisePhone, parseClientNumber } from "@/lib/clientNumber";
import { invoicesFor } from "@/lib/invoices";
import { companyById, COMPANIES, companyForEstate } from "@/lib/reference/companies";
import { DEMO_COMPANIES, DEMO_ESTATES } from "@/lib/reference/demo";
import { ESTATE_LIST, estatePoint, ESTATES, NAIROBI_CENTRE } from "@/lib/reference/estates";
import { applyReference } from "@/lib/reference/registry";
import { dueAt, isOverdue } from "@/lib/tickets";
import type { Txn } from "@/lib/types";
import { effectivePermissions } from "@/server/accessStore";
import { verifyTotp } from "@/server/mfa";
import { who } from "@/server/rateLimit";

describe("client numbers", () => {
  it("issues numbers whose check digit parses back", () => {
    const seq: Record<string, number> = { TSKIL: 141 };
    const id = nextClientNumber(seq, "TS", "KIL", () => 0);
    expect(id).toBe(`TS-KIL-0142${luhn("0142")}`);
    expect(parseClientNumber(id.toLowerCase().replace(/-/g, " "))).toEqual({ ok: true, id, co: "TS" });
  });

  it("rejects a mistyped digit", () => {
    const good = `TS-KIL-0142${luhn("0142")}`;
    const bad = good.slice(0, -2) + ((Number(good.at(-2)) + 1) % 10) + good.at(-1);
    expect(parseClientNumber(bad).ok).toBe(false);
  });

  it("normalises Kenyan phone numbers", () => {
    expect(normalisePhone("+254712345678")).toBe("0712 345 678");
    expect(normalisePhone("0712 345678")).toBe("0712 345 678");
  });
});

describe("invoices", () => {
  const client = { id: "TS-KIL-01427", company: "TS" };
  const txn = (id: string, date: string, kind: Txn["kind"], amount: number): Txn => ({ id, client: client.id, date, kind, amount, desc: id });

  it("applies payments to the oldest invoice first", () => {
    const txns = [
      txn("C1", "2026-07-01 08:00", "charge", 1000),
      txn("C2", "2026-08-01 08:00", "charge", 1000),
      txn("C3", "2026-09-01 08:00", "charge", 1000),
      txn("P1", "2026-09-05 10:00", "payment", 1500),
    ];
    const byId = Object.fromEntries(invoicesFor(txns, [client], "2026-09-06").map((i) => [i.id, i]));
    expect(byId.C1).toMatchObject({ paid: 1000, balance: 0, status: "paid" });
    expect(byId.C2).toMatchObject({ paid: 500, balance: 500, status: "overdue" });
    expect(byId.C3).toMatchObject({ paid: 0, balance: 1000, status: "unpaid", due: "2026-09-11" });
  });

  it("never allocates more than was paid", () => {
    const txns = [txn("C1", "2026-09-01 08:00", "charge", 800), txn("P1", "2026-09-02 08:00", "payment", 2000)];
    const [inv] = invoicesFor(txns, [client], "2026-09-03");
    expect(inv).toMatchObject({ paid: 800, balance: 0, status: "paid" });
  });
});

describe("the books", () => {
  it("refuses unbalanced or malformed manual entries", () => {
    expect(validateLines([{ account: "1100", debit: 100, credit: 0 }])).toMatch(/two lines/);
    expect(
      validateLines([
        { account: "1100", debit: 100, credit: 0 },
        { account: "4000", debit: 0, credit: 90 },
      ]),
    ).toMatch(/must be equal/);
    expect(
      validateLines([
        { account: "1100", debit: 100.5, credit: 0 },
        { account: "4000", debit: 0, credit: 100.5 },
      ]),
    ).toMatch(/whole shillings/);
  });

  it("keeps the trial balance balanced", () => {
    const entries: JournalEntry[] = [
      { id: "J1", date: "2026-09-01", source: "manual", memo: "", lines: [{ account: "1100", debit: 500, credit: 0 }, { account: "4000", debit: 0, credit: 500 }] },
      { id: "J2", date: "2026-09-02", source: "manual", memo: "", lines: [{ account: "1000", debit: 300, credit: 0 }, { account: "1100", debit: 0, credit: 300 }] },
    ];
    const tb = trialBalance(entries, "2026-09-30");
    expect(tb.balanced).toBe(true);
    expect(tb.debit).toBe(500);
  });
});

describe("tickets", () => {
  it("sets deadlines by priority, in Nairobi time", () => {
    expect(dueAt({ createdAt: "2026-09-25 22:00", priority: "urgent" })).toBe("2026-09-26 02:00");
    expect(dueAt({ createdAt: "2026-09-25 10:00", priority: "low" })).toBe("2026-09-28 10:00");
    expect(isOverdue({ createdAt: "2026-09-25 10:00", priority: "high", status: "Open" }, "2026-09-25 18:01")).toBe(true);
    expect(isOverdue({ createdAt: "2026-09-25 10:00", priority: "high", status: "Resolved" }, "2026-09-26 10:00")).toBe(false);
  });
});

describe("authenticator codes (RFC 6238)", () => {
  // The RFC's SHA-1 key "12345678901234567890", in base32.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the published test vectors", () => {
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "081804", 1_111_111_109_000)).toBe(true);
  });

  it("allows one step of drift and no more", () => {
    expect(verifyTotp(secret, "081804", 1_111_111_109_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, "081804", 1_111_111_109_000 + 90_000)).toBe(false);
    expect(verifyTotp(secret, "12345", 59_000)).toBe(false);
  });
});

describe("permissions", () => {
  const role = { id: "company_staff", name: "Staff", description: "", workspace: "company" as const, system: true, permissions: ["clients.view"] };

  it("adds the department's and the person's grants, then takes away denials", async () => {
    const perms = await effectivePermissions(
      { roleId: "company_staff", grants: ["tickets.reply"], denies: ["payments.view"], scope: { companyId: "TS" } },
      role,
      { id: "d", company: "TS", name: "Finance", description: "", permissions: ["payments.view", "finance.view"], createdAt: "" },
    );
    expect(perms).toEqual(["clients.view", "finance.view", "tickets.reply"]);
  });
});

describe("reference data", () => {
  it("is filled in place, so every importer sees it", () => {
    const estates = DEMO_ESTATES.map((e) => ({ ...e, company: DEMO_COMPANIES.find((c) => c.estates.includes(e.code))?.id ?? null }));
    applyReference({ companies: DEMO_COMPANIES.map((c) => ({ ...c, estates: [] })), estates });
    expect(COMPANIES).toHaveLength(3);
    expect(ESTATE_LIST).toHaveLength(10);
    expect(ESTATES.KIL.name).toBe("Kilimani");
    // Estates served are derived from each estate's company.
    expect(companyById("TS").estates).toEqual(["KAR", "KIL", "LAV", "WES"]);
    expect(companyForEstate("RUA")?.id).toBe("KW");

    applyReference({ companies: [], estates: [] });
    expect(COMPANIES).toHaveLength(0);
    expect(ESTATES.KIL).toBeUndefined();
  });

  it("degrades gracefully for unknown codes", () => {
    applyReference({ companies: [], estates: [] });
    expect(companyById("ZZ")).toMatchObject({ id: "ZZ", name: "ZZ", estates: [] });
    expect(estatePoint("NOPE")).toEqual(NAIROBI_CENTRE);
  });
});

describe("rate limit keys", () => {
  it("treat every spelling of a phone or email as one person", () => {
    expect(who("+254 712 345 678")).toBe(who("0712345678"));
    expect(who("  Ops@TakaSafi.co.ke ")).toBe("ops@takasafi.co.ke");
  });
});
