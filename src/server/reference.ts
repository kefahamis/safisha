// Server-only. The companies and estates on the platform: loading them, and onboarding new ones.
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { applyReference, currentReference, type ReferenceData } from "@/lib/reference/registry";
import { getDb, type Db } from "./db";
import * as t from "./db/schema";
import { createStarterDepartments } from "./db/teamSeed";
import { HttpError } from "./session";
import { nowStamp } from "./time";

export async function readReference(db: Db): Promise<ReferenceData> {
  const [companies, estates] = await Promise.all([
    db.select().from(t.companies).orderBy(asc(t.companies.name)),
    db.select().from(t.estates).orderBy(asc(t.estates.name)),
  ]);
  return {
    companies: companies.map(({ createdAt: _c, ...c }) => ({ ...c, estates: [] })),
    estates: estates.map(({ createdAt: _c, ...e }) => e),
  };
}

/** Reads the reference tables into the in-memory registry every screen reads from. */
export async function loadReference(db: Db) {
  applyReference(await readReference(db));
}

/** The data to hand the browser, fresh as of this request. */
export async function referenceForClient(): Promise<ReferenceData> {
  await getDb();
  return currentReference();
}

/* ---------------- onboarding ---------------- */

const phoneish = z.string().trim().max(40);

export const CompanyBody = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "The code is two letters, e.g. TS. It starts every client number."),
  name: z.string().trim().min(2, "Enter the company's name.").max(80),
  paybill: z
    .string()
    .trim()
    .regex(/^\d{5,7}$/, "A Paybill is 5 to 7 digits.")
    .or(z.literal("")),
  care: phoneish,
  hours: z.string().trim().max(60),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
});
export type CompanyInput = z.infer<typeof CompanyBody>;

export const EstateBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "The code is three letters, e.g. KIL. It sits inside client numbers."),
  name: z.string().trim().min(2, "Enter the estate's name.").max(60),
  // Roughly Kenya, so a swapped latitude and longitude is caught.
  lat: z.number().min(-5, "That latitude isn't in Kenya.").max(5.5, "That latitude isn't in Kenya."),
  lng: z.number().min(33.5, "That longitude isn't in Kenya.").max(42, "That longitude isn't in Kenya."),
  radius: z.number().int().min(200, "Use at least 200 m.").max(15000, "Use at most 15 km."),
  days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one collection day.").max(7),
  company: z.string().nullable(),
});
export type EstateInput = z.infer<typeof EstateBody>;

async function count(db: Db, table: typeof t.clients | typeof t.trucks, where: ReturnType<typeof eq>) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return n;
}

async function refreshed<T>(db: Db, value: T) {
  await loadReference(db);
  return value;
}

export async function createCompany(input: CompanyInput) {
  const db = await getDb();
  const [clash] = await db.select().from(t.companies).where(eq(t.companies.id, input.id));
  if (clash) throw new HttpError(409, `${input.id} is already ${clash.name}'s code.`);
  if (input.paybill) {
    const [taken] = await db.select().from(t.companies).where(eq(t.companies.paybill, input.paybill));
    if (taken) throw new HttpError(409, `Paybill ${input.paybill} already belongs to ${taken.name}.`);
  }
  await db.transaction(async (tx) => {
    await tx.insert(t.companies).values({ ...input, createdAt: nowStamp() });
    await createStarterDepartments(tx as unknown as Db, input.id);
  });
  return refreshed(db, input);
}

export async function updateCompany(id: string, input: Omit<CompanyInput, "id">) {
  const db = await getDb();
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, id));
  if (!row) throw new HttpError(404, "No such company.");
  if (input.paybill && input.paybill !== row.paybill) {
    const [taken] = await db.select().from(t.companies).where(eq(t.companies.paybill, input.paybill));
    if (taken && taken.id !== id) throw new HttpError(409, `Paybill ${input.paybill} already belongs to ${taken.name}.`);
  }
  await db.update(t.companies).set(input).where(eq(t.companies.id, id));
  return refreshed(db, { ...row, ...input });
}

/** Only a company with nothing on it yet; otherwise its history would be orphaned. */
export async function deleteCompany(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, id));
  if (!row) throw new HttpError(404, "No such company.");
  if (await count(db, t.clients, eq(t.clients.company, id))) throw new HttpError(409, `${row.name} has clients, so it can't be removed.`);
  if (await count(db, t.trucks, eq(t.trucks.company, id))) throw new HttpError(409, `${row.name} has trucks, so it can't be removed.`);
  const [{ n: staff }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.users)
    .where(sql`${t.users.scope}->>'companyId' = ${id}`);
  if (staff) throw new HttpError(409, `${row.name} has staff accounts. Remove them first.`);
  await db.transaction(async (tx) => {
    await tx.update(t.estates).set({ company: null }).where(eq(t.estates.company, id));
    await tx.delete(t.departments).where(eq(t.departments.company, id));
    await tx.delete(t.companies).where(eq(t.companies.id, id));
  });
  return refreshed(db, row);
}

async function requireCompanyExists(db: Db, id: string | null) {
  if (!id) return;
  const [row] = await db.select().from(t.companies).where(eq(t.companies.id, id));
  if (!row) throw new HttpError(400, "Pick a company on the platform.");
}

export async function createEstate(input: EstateInput) {
  const db = await getDb();
  const [clash] = await db.select().from(t.estates).where(eq(t.estates.code, input.code));
  if (clash) throw new HttpError(409, `${input.code} is already ${clash.name}'s code.`);
  await requireCompanyExists(db, input.company);
  const days = [...new Set(input.days)].sort();
  await db.insert(t.estates).values({ ...input, days, createdAt: nowStamp() });
  return refreshed(db, { ...input, days });
}

export async function updateEstate(code: string, input: Omit<EstateInput, "code">) {
  const db = await getDb();
  const [row] = await db.select().from(t.estates).where(eq(t.estates.code, code));
  if (!row) throw new HttpError(404, "No such estate.");
  await requireCompanyExists(db, input.company);
  // Clients carry their company in their account number; they can't be moved by reassigning the estate.
  if (row.company && input.company !== row.company && (await count(db, t.clients, eq(t.clients.estate, code)))) {
    throw new HttpError(409, `${row.name} has clients with its current company, so it can't change hands.`);
  }
  const days = [...new Set(input.days)].sort();
  await db.update(t.estates).set({ ...input, days }).where(eq(t.estates.code, code));
  return refreshed(db, { ...row, ...input, days });
}

export async function deleteEstate(code: string) {
  const db = await getDb();
  const [row] = await db.select().from(t.estates).where(eq(t.estates.code, code));
  if (!row) throw new HttpError(404, "No such estate.");
  if (await count(db, t.clients, eq(t.clients.estate, code))) throw new HttpError(409, `${row.name} has clients, so it can't be removed.`);
  await db.delete(t.estates).where(eq(t.estates.code, code));
  return refreshed(db, row);
}

/** The admin screen's view: each company and estate with how much hangs off it. */
export async function referenceOverview() {
  const db = await getDb();
  await loadReference(db);
  const clientCounts = await db
    .select({ company: t.clients.company, estate: t.clients.estate, n: sql<number>`count(*)::int` })
    .from(t.clients)
    .groupBy(t.clients.company, t.clients.estate);
  const truckCounts = await db
    .select({ company: t.trucks.company, n: sql<number>`count(*)::int` })
    .from(t.trucks)
    .groupBy(t.trucks.company);
  const staffCounts = await db
    .select({ company: sql<string>`${t.users.scope}->>'companyId'`, n: sql<number>`count(*)::int` })
    .from(t.users)
    .where(sql`${t.users.scope} ? 'companyId'`)
    .groupBy(sql`${t.users.scope}->>'companyId'`);
  const ref = currentReference();
  return {
    companies: ref.companies.map((c) => ({
      ...c,
      clients: clientCounts.filter((x) => x.company === c.id).reduce((a, x) => a + x.n, 0),
      trucks: truckCounts.find((x) => x.company === c.id)?.n ?? 0,
      staff: staffCounts.find((x) => x.company === c.id)?.n ?? 0,
    })),
    estates: ref.estates.map((e) => ({
      ...e,
      clients: clientCounts.filter((x) => x.estate === e.code).reduce((a, x) => a + x.n, 0),
    })),
  };
}
export type ReferenceOverview = Awaited<ReturnType<typeof referenceOverview>>;
