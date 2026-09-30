// Server-only. The care-package catalogue, which package each company is on, and the monthly charge.
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Session } from "@/lib/auth/types";
import {
  featureLabel,
  isPackageFeature,
  MAX_PACKAGE_PRICE,
  type CarePackageDef,
  type PackageFeature,
  type PackageView,
} from "@/lib/packages";
import { audit } from "./audit";
import { getDb, schema as t } from "./db";
import { HttpError } from "./session";
import { nowStamp, thisMonth } from "./time";

const toDef = (r: typeof t.carePackages.$inferSelect): CarePackageDef => ({
  id: r.id,
  name: r.name,
  description: r.description,
  price: r.price,
  features: r.features.filter(isPackageFeature),
  active: r.active,
  sort: r.sort,
});

/** The catalogue, in the platform's order. Retired packages only when asked. */
export async function listPackages(opts: { includeRetired?: boolean } = {}): Promise<CarePackageDef[]> {
  const db = await getDb();
  const rows = await db.select().from(t.carePackages).orderBy(asc(t.carePackages.sort), asc(t.carePackages.price));
  return rows.map(toDef).filter((p) => opts.includeRetired || p.active);
}

async function findPackage(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(t.carePackages).where(eq(t.carePackages.id, id));
  return row ? toDef(row) : null;
}

/** The company's package and what it pays for it, or null with no package. */
async function subscription(company: string) {
  const db = await getDb();
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, company));
  if (!row) throw new HttpError(404, "No such company.");
  const pkg = row.carePackage ? await findPackage(row.carePackage) : null;
  return {
    row,
    pkg,
    price: pkg ? (row.packagePrice ?? pkg.price) : 0,
  };
}

/** What the company's package includes. */
export async function companyFeatures(company: string | null | undefined): Promise<Set<PackageFeature>> {
  if (!company) return new Set();
  const db = await getDb();
  const [row] = await db
    .select({ features: t.carePackages.features })
    .from(t.companies)
    .innerJoin(t.carePackages, eq(t.carePackages.id, t.companies.carePackage))
    .where(eq(t.companies.id, company));
  return new Set((row?.features ?? []).filter(isPackageFeature));
}

export const hasFeature = async (company: string | null | undefined, feature: PackageFeature) =>
  (await companyFeatures(company)).has(feature);

/** Throws unless the company's package includes the feature. */
export async function requireFeature(company: string, feature: PackageFeature) {
  if (!(await hasFeature(company, feature))) {
    throw new HttpError(
      403,
      `Your care package doesn't include ${featureLabel(feature)}. Subscribe under Customer care › Care package.`,
    );
  }
}

/**
 * Charges the month at `amount`. A month is charged once; switching to a
 * dearer package in the same month tops it up to the new price, never down.
 */
async function chargeMonth(company: string, month: string, amount: number) {
  if (amount <= 0) return 0;
  const db = await getDb();
  const [before] = await db
    .select({ amount: t.packageCharges.amount })
    .from(t.packageCharges)
    .where(and(eq(t.packageCharges.company, company), eq(t.packageCharges.month, month)));
  if (before && before.amount >= amount) return 0;
  await db
    .insert(t.packageCharges)
    .values({ company, month, amount, chargedAt: nowStamp() })
    .onConflictDoUpdate({
      target: [t.packageCharges.company, t.packageCharges.month],
      set: { amount: sql`greatest(${t.packageCharges.amount}, ${amount})` },
    });
  return amount - (before?.amount ?? 0);
}

/**
 * Puts a company on a package, or on none. The current month is charged at
 * once (topped up when moving to a dearer package); cancelling stops next
 * month's charge and this month stays paid.
 *
 * A company admin picks from what's on offer and pays the package's price.
 * The platform admin may also use a retired package and set the company's
 * own price (`price`: a number, or null for the package's price).
 */
export async function setCompanyPackage(
  actor: Session,
  company: string,
  packageId: string | null,
  opts: { asPlatform?: boolean; price?: number | null } = {},
) {
  const db = await getDb();
  const { row, pkg: before } = await subscription(company);
  const next = packageId ? await findPackage(packageId) : null;
  if (packageId && !next) throw new HttpError(404, "No such package.");
  if (next && !next.active && !opts.asPlatform && next.id !== row.carePackage) {
    throw new HttpError(400, `${next.name} isn't offered any more.`);
  }

  const changed = (row.carePackage ?? null) !== (next?.id ?? null);
  // A company's own price was agreed for its package; a switch it makes itself goes back to list price.
  const packagePrice = opts.asPlatform && opts.price !== undefined ? opts.price : changed ? null : row.packagePrice;
  if (!changed && packagePrice === row.packagePrice) return packageView(company);

  await db
    .update(t.companies)
    .set({ carePackage: next?.id ?? null, packagePrice, packageSince: changed ? nowStamp() : row.packageSince })
    .where(eq(t.companies.id, company));

  const price = next ? (packagePrice ?? next.price) : 0;
  const charged = changed && next ? await chargeMonth(company, thisMonth(), price) : 0;
  await audit(actor, {
    action: "package.change",
    target: company,
    company,
    detail: {
      from: before?.name ?? "No package",
      to: next?.name ?? "No package",
      ...(packagePrice !== null ? { price: packagePrice } : {}),
      ...(charged ? { charged } : {}),
    },
  });
  return packageView(company);
}

/**
 * The monthly run: every company on a package since before this month began
 * is charged for it. Safe to run daily; each month is charged once.
 */
export async function chargePackagesForMonth() {
  const db = await getDb();
  const month = thisMonth();
  const rows = await db.select().from(t.companies).where(sql`${t.companies.carePackage} is not null`);
  const charged: Record<string, number> = {};
  for (const co of rows) {
    // Joined this month: subscribing already charged it (or it predates billing).
    if (co.packageSince && co.packageSince.slice(0, 7) >= month) continue;
    const { price } = await subscription(co.id);
    const amount = await chargeMonth(co.id, month, price);
    if (amount) charged[co.id] = amount;
  }
  return charged;
}

export async function packageView(company: string): Promise<PackageView> {
  const db = await getDb();
  const { row, pkg, price } = await subscription(company);
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
    current: pkg ? { ...pkg, price, customPrice: row.packagePrice !== null } : null,
    since: row.packageSince ?? undefined,
    offered: await listPackages(),
    charges,
    skippedThisMonth: skipped?.n ?? 0,
  };
}

/** For the admin's company list: each company's package and what it's been charged so far. */
export async function packageOverview() {
  const db = await getDb();
  const rows = await db
    .select({ id: t.companies.id, pkg: t.companies.carePackage, price: t.companies.packagePrice })
    .from(t.companies);
  const totals = await db
    .select({ company: t.packageCharges.company, amount: sql<number>`coalesce(sum(${t.packageCharges.amount}), 0)::int` })
    .from(t.packageCharges)
    .groupBy(t.packageCharges.company);
  return {
    packages: await listPackages({ includeRetired: true }),
    companies: rows.map((r) => ({
      id: r.id,
      carePackage: r.pkg,
      packagePrice: r.price,
      packageEarned: totals.find((x) => x.company === r.id)?.amount ?? 0,
    })),
  };
}

/* ---------------- the catalogue, for the platform admin ---------------- */

export const PackageBody = z.object({
  name: z.string().trim().min(2, "Give the package a name.").max(40, "Keep the name under 40 characters."),
  description: z.string().trim().max(240, "Keep the description under 240 characters."),
  price: z
    .number()
    .int("The price is a whole number of shillings.")
    .min(0, "The price can't be negative.")
    .max(MAX_PACKAGE_PRICE, "That price is too high."),
  features: z.array(z.string()).transform((f) => [...new Set(f.filter(isPackageFeature))]),
  active: z.boolean(),
  sort: z.number().int().min(0).max(999).optional(),
});
export type PackageInput = z.infer<typeof PackageBody>;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "package";

export async function createPackage(actor: Session, input: PackageInput) {
  const db = await getDb();
  let id = slug(input.name);
  for (let n = 2; await findPackage(id); n++) id = `${slug(input.name)}-${n}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${t.carePackages.sort}), -1)::int` }).from(t.carePackages);
  await db.insert(t.carePackages).values({ id, ...input, sort: input.sort ?? max + 1, createdAt: nowStamp() });
  await audit(actor, { action: "package.create", target: input.name, detail: { price: input.price, features: input.features } });
  return (await findPackage(id))!;
}

/** A new price applies from the next charge; months already charged keep their amount. */
export async function updatePackage(actor: Session, id: string, input: PackageInput) {
  const before = await findPackage(id);
  if (!before) throw new HttpError(404, "No such package.");
  const db = await getDb();
  await db
    .update(t.carePackages)
    .set({ ...input, sort: input.sort ?? before.sort })
    .where(eq(t.carePackages.id, id));
  const detail: Record<string, unknown> = {};
  if (before.price !== input.price) detail.price = `${before.price} → ${input.price}`;
  if (before.active !== input.active) detail.active = input.active;
  if (before.features.join() !== input.features.join()) detail.features = input.features;
  if (before.name !== input.name) detail.name = input.name;
  await audit(actor, { action: "package.update", target: before.name, detail });
  return (await findPackage(id))!;
}

/** Only a package nobody is on; otherwise retire it (untick Offered) instead. */
export async function deletePackage(actor: Session, id: string) {
  const pkg = await findPackage(id);
  if (!pkg) throw new HttpError(404, "No such package.");
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.companies)
    .where(eq(t.companies.carePackage, id));
  if (n) throw new HttpError(409, `${n} ${n === 1 ? "company is" : "companies are"} on ${pkg.name}. Stop offering it instead.`);
  await db.delete(t.carePackages).where(eq(t.carePackages.id, id));
  await audit(actor, { action: "package.delete", target: pkg.name });
}

/** How many companies are on each package, for the catalogue screen. */
export async function packageSubscribers(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ pkg: t.companies.carePackage, n: sql<number>`count(*)::int` })
    .from(t.companies)
    .where(sql`${t.companies.carePackage} is not null`)
    .groupBy(t.companies.carePackage);
  return Object.fromEntries(rows.map((r) => [r.pkg!, r.n]));
}
