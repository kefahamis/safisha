// Server-only. Which care package each company is on, and the monthly Premium charge.
import { and, eq, sql } from "drizzle-orm";
import type { Session } from "@/lib/auth/types";
import { isCarePackage, type CarePackage, type PackageView } from "@/lib/packages";
import { audit } from "./audit";
import { getDb, schema as t } from "./db";
import { HttpError } from "./session";
import { platformPremiumFee, premiumFeeFor } from "./settings";
import { nowStamp, thisMonth } from "./time";

export async function carePackage(company: string | null | undefined): Promise<CarePackage> {
  if (!company) return "basic";
  const db = await getDb();
  const [row] = await db.select({ p: t.companies.carePackage }).from(t.companies).where(eq(t.companies.id, company));
  return isCarePackage(row?.p) ? row.p : "basic";
}

export const isPremium = async (company: string | null | undefined) => (await carePackage(company)) === "premium";

/** Charges one month once; a second call for the same month does nothing. */
async function chargeMonth(company: string, month: string, amount: number) {
  const db = await getDb();
  const rows = await db
    .insert(t.packageCharges)
    .values({ company, month, amount, chargedAt: nowStamp() })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}

/**
 * Moves a company between packages. Upgrading charges the current month at
 * once (unless it's already been charged); downgrading stops next month's
 * charge, and this month stays paid.
 */
export async function setCarePackage(actor: Session, company: string, next: CarePackage) {
  if (!isCarePackage(next)) throw new HttpError(400, "Unknown package.");
  const db = await getDb();
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, company));
  if (!row) throw new HttpError(404, "No such company.");
  if (row.carePackage === next) return packageView(company);

  const at = nowStamp();
  await db
    .update(t.companies)
    .set({ carePackage: next, premiumSince: next === "premium" ? at : row.premiumSince })
    .where(eq(t.companies.id, company));

  let charged = 0;
  if (next === "premium") {
    const fee = await premiumFeeFor(company);
    if (fee > 0 && (await chargeMonth(company, thisMonth(), fee))) charged = fee;
  }
  await audit(actor, {
    action: "package.change",
    target: company,
    company,
    detail: { from: row.carePackage, to: next, ...(charged ? { charged } : {}) },
  });
  return packageView(company);
}

/**
 * The monthly run: every company on Premium since before this month began is
 * charged for it. Safe to run daily; each month is charged once.
 */
export async function chargePremiumMonth() {
  const db = await getDb();
  const month = thisMonth();
  const rows = await db.select().from(t.companies).where(eq(t.companies.carePackage, "premium"));
  const charged: Record<string, number> = {};
  for (const co of rows) {
    // Joined this month: the upgrade already charged it (or it predates billing).
    if (co.premiumSince && co.premiumSince.slice(0, 7) >= month) continue;
    const fee = await premiumFeeFor(co.id);
    if (fee > 0 && (await chargeMonth(co.id, month, fee))) charged[co.id] = fee;
  }
  return charged;
}

export async function packageView(company: string): Promise<PackageView> {
  const db = await getDb();
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, company));
  if (!row) throw new HttpError(404, "No such company.");
  const charges = await db
    .select({ month: t.packageCharges.month, amount: t.packageCharges.amount })
    .from(t.packageCharges)
    .where(eq(t.packageCharges.company, company))
    .orderBy(sql`${t.packageCharges.month} desc`);
  const [skipped] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.smsOutbox)
    .where(
      and(
        eq(t.smsOutbox.company, company),
        eq(t.smsOutbox.status, "skipped"),
        sql`${t.smsOutbox.createdAt} >= date_trunc('month', now() AT TIME ZONE 'UTC' + interval '3 hours') - interval '3 hours'`,
      ),
    );
  return {
    company,
    package: isCarePackage(row.carePackage) ? row.carePackage : "basic",
    premiumSince: row.premiumSince ?? undefined,
    fee: await premiumFeeFor(company),
    customFee: row.premiumFee !== null,
    charges,
    skippedThisMonth: skipped?.n ?? 0,
  };
}

/** For the admin's company list: each company's package and Premium fees charged so far. */
export async function packageOverview() {
  const db = await getDb();
  const rows = await db
    .select({ id: t.companies.id, pkg: t.companies.carePackage, fee: t.companies.premiumFee })
    .from(t.companies);
  const totals = await db
    .select({ company: t.packageCharges.company, amount: sql<number>`coalesce(sum(${t.packageCharges.amount}), 0)::int` })
    .from(t.packageCharges)
    .groupBy(t.packageCharges.company);
  return {
    defaultPremiumFee: await platformPremiumFee(),
    companies: rows.map((r) => ({
      id: r.id,
      carePackage: isCarePackage(r.pkg) ? r.pkg : ("basic" as CarePackage),
      premiumFee: r.fee,
      premiumEarned: totals.find((x) => x.company === r.id)?.amount ?? 0,
    })),
  };
}
