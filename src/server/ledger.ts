// Server-only. A company's books: postings derived from billing and M-Pesa, plus manual journals.
import { desc, eq, inArray, like, sql } from "drizzle-orm";
import { validateLines, type JournalEntry, type JournalLine } from "@/lib/accounting";
import type { Session } from "@/lib/auth/types";
import { audit } from "./audit";
import { getDb, schema } from "./db";
import { visibleCompanies } from "./snapshot";
import { HttpError } from "./session";
import { today } from "./time";

const t = schema;

const AR = "1100";
const MPESA = "1000";
const SUSPENSE = "2100";
const COLLECTION_FEES = "4000";
const PICKUP_FEES = "4100";

const line = (account: string, debit: number, credit: number): JournalLine => ({ account, debit, credit });

/** Throws unless the session may see this company's books. */
export async function requireCompanyBooks(session: Session, company: string) {
  const companies = await visibleCompanies(session);
  if (companies !== null && !companies.includes(company)) {
    throw new HttpError(403, "That belongs to another company.");
  }
}

/**
 * Every entry in the company's books. Charges and payments already live in
 * `txns` and `suspense`; turning them into balanced entries here keeps one
 * source of truth rather than writing each shilling twice.
 */
export async function companyJournal(company: string): Promise<JournalEntry[]> {
  const db = await getDb();
  const clientRows = await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.company, company));
  const clientIds = clientRows.map((c) => c.id);

  const [txnRows, suspenseRows, entryRows] = await Promise.all([
    clientIds.length ? db.select().from(t.txns).where(inArray(t.txns.client, clientIds)) : Promise.resolve([]),
    db.select().from(t.suspense).where(eq(t.suspense.company, company)),
    db.select().from(t.journalEntries).where(eq(t.journalEntries.company, company)),
  ]);
  const lineRows = entryRows.length
    ? await db.select().from(t.journalLines).where(inArray(t.journalLines.entry, entryRows.map((e) => e.id)))
    : [];

  const out: JournalEntry[] = [];

  for (const x of txnRows) {
    if (x.amount <= 0) continue;
    const date = x.date.slice(0, 10);
    if (x.kind === "charge") {
      const income = x.desc.startsWith("On-demand pickup") ? PICKUP_FEES : COLLECTION_FEES;
      out.push({
        id: `INV-${x.id}`,
        date,
        source: "billing",
        memo: x.desc,
        reference: x.client,
        lines: [line(AR, x.amount, 0), line(income, 0, x.amount)],
      });
    } else {
      out.push({
        id: `RCT-${x.id}`,
        date,
        source: "payment",
        memo: `${x.desc}${x.payer ? ` · ${x.payer}` : ""}`,
        reference: x.client,
        lines: [line(MPESA, x.amount, 0), line(AR, 0, x.amount)],
      });
    }
  }

  for (const p of suspenseRows) {
    out.push({
      id: `SUS-${p.id}`,
      date: p.date.slice(0, 10),
      source: "suspense",
      memo: `Unmatched Paybill payment · ${p.payer} · ${p.reason}`,
      reference: p.account,
      lines: [line(MPESA, p.amount, 0), line(SUSPENSE, 0, p.amount)],
    });
  }

  const reversedBy = new Map(entryRows.filter((e) => e.reverses).map((e) => [e.reverses!, e.id]));
  for (const e of entryRows) {
    out.push({
      id: e.id,
      date: e.date,
      source: "manual",
      memo: e.memo,
      reference: e.reference ?? undefined,
      postedBy: e.postedByName,
      reverses: e.reverses ?? undefined,
      reversedBy: reversedBy.get(e.id),
      lines: lineRows
        .filter((l) => l.entry === e.id)
        .sort((a, b) => a.id - b.id)
        .map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, memo: l.memo ?? undefined })),
    });
  }

  return out;
}

async function nextEntryId() {
  const db = await getDb();
  const [row] = await db
    .select({ id: t.journalEntries.id })
    .from(t.journalEntries)
    .where(like(t.journalEntries.id, "JE-%"))
    .orderBy(desc(sql`substring(${t.journalEntries.id} from 4)::int`))
    .limit(1);
  return `JE-${(row ? Number(row.id.slice(3)) : 1000) + 1}`;
}

export interface NewEntry {
  date: string;
  memo: string;
  reference?: string;
  lines: JournalLine[];
}

export async function postEntry(session: Session, company: string, input: NewEntry, reverses?: string) {
  const memo = input.memo.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new HttpError(400, "Pick a valid date.");
  if (input.date > today()) throw new HttpError(400, "Entries can't be dated in the future.");
  if (!memo) throw new HttpError(400, "Describe what the entry is for.");
  const lines = input.lines.map((l) => ({
    account: l.account,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    memo: l.memo?.trim() || undefined,
  }));
  const problem = validateLines(lines);
  if (problem) throw new HttpError(400, problem);

  const db = await getDb();
  const id = await nextEntryId();
  await db.transaction(async (tx) => {
    await tx.insert(t.journalEntries).values({
      id,
      company,
      date: input.date,
      memo: memo.slice(0, 200),
      reference: input.reference?.trim().slice(0, 60) || null,
      reverses: reverses ?? null,
      postedBy: session.sub,
      postedByName: session.name,
    });
    await tx.insert(t.journalLines).values(
      lines.map((l) => ({ entry: id, account: l.account, debit: l.debit, credit: l.credit, memo: l.memo ?? null })),
    );
  });
  const total = lines.reduce((s, l) => s + l.debit, 0);
  await audit(session, {
    action: reverses ? "journal.reverse" : "journal.post",
    target: id,
    company,
    detail: { memo, total, ...(reverses ? { reverses } : {}) },
  });
  return id;
}

/** Undo a manual entry with its mirror image, dated today. Posted entries are never edited. */
export async function reverseEntry(session: Session, id: string) {
  const db = await getDb();
  const [entry] = await db.select().from(t.journalEntries).where(eq(t.journalEntries.id, id));
  if (!entry) throw new HttpError(404, "No such journal entry.");
  await requireCompanyBooks(session, entry.company);
  if (entry.reverses) throw new HttpError(400, "A reversal can't itself be reversed.");
  const [already] = await db.select({ id: t.journalEntries.id }).from(t.journalEntries).where(eq(t.journalEntries.reverses, id));
  if (already) throw new HttpError(409, `Already reversed by ${already.id}.`);

  const lines = await db.select().from(t.journalLines).where(eq(t.journalLines.entry, id));
  return postEntry(
    session,
    entry.company,
    {
      date: today(),
      memo: `Reversal of ${id}: ${entry.memo}`,
      reference: entry.reference ?? undefined,
      lines: lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit, memo: l.memo ?? undefined })),
    },
    id,
  );
}
