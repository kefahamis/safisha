/*
 * Double-entry bookkeeping for a collection company. Shared by client and
 * server: the server turns billing, M-Pesa and manual journals into entries;
 * the reports below are pure functions over those entries.
 *
 * Amounts are whole shillings, like every other amount in the app.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  /** Sub-heading on the balance sheet and P&L. */
  section: string;
}

/** The standard chart every company books against. */
export const ACCOUNTS: Account[] = [
  { code: "1000", name: "M-Pesa Paybill", type: "asset", section: "Current assets" },
  { code: "1010", name: "Bank", type: "asset", section: "Current assets" },
  { code: "1020", name: "Petty cash", type: "asset", section: "Current assets" },
  { code: "1100", name: "Accounts receivable", type: "asset", section: "Current assets" },
  { code: "1500", name: "Trucks & equipment", type: "asset", section: "Non-current assets" },
  { code: "1510", name: "Accumulated depreciation", type: "asset", section: "Non-current assets" },

  { code: "2000", name: "Accounts payable", type: "liability", section: "Current liabilities" },
  { code: "2100", name: "Unallocated M-Pesa receipts", type: "liability", section: "Current liabilities" },
  { code: "2200", name: "Taxes payable", type: "liability", section: "Current liabilities" },
  { code: "2500", name: "Loans", type: "liability", section: "Non-current liabilities" },

  { code: "3000", name: "Owner's capital", type: "equity", section: "Equity" },
  { code: "3100", name: "Retained earnings", type: "equity", section: "Equity" },
  { code: "3200", name: "Drawings", type: "equity", section: "Equity" },

  { code: "4000", name: "Collection fees", type: "income", section: "Revenue" },
  { code: "4100", name: "On-demand pickup fees", type: "income", section: "Revenue" },
  { code: "4200", name: "Recyclables sales", type: "income", section: "Revenue" },
  { code: "4900", name: "Other income", type: "income", section: "Other income" },

  { code: "5000", name: "Fuel", type: "expense", section: "Operating expenses" },
  { code: "5100", name: "Wages & salaries", type: "expense", section: "Operating expenses" },
  { code: "5200", name: "Vehicle maintenance", type: "expense", section: "Operating expenses" },
  { code: "5300", name: "Dumpsite fees", type: "expense", section: "Operating expenses" },
  { code: "5400", name: "Rent & utilities", type: "expense", section: "Operating expenses" },
  { code: "5500", name: "M-Pesa & bank charges", type: "expense", section: "Operating expenses" },
  { code: "5600", name: "Licences & permits", type: "expense", section: "Operating expenses" },
  { code: "5700", name: "Depreciation", type: "expense", section: "Operating expenses" },
  { code: "5900", name: "Other expenses", type: "expense", section: "Operating expenses" },
];

const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));
export const accountByCode = (code: string) => BY_CODE.get(code);
export const accountLabel = (code: string) => `${code} · ${BY_CODE.get(code)?.name ?? "Unknown"}`;

/** Accounts whose balance normally sits on the debit side. */
export const debitNormal = (type: AccountType) => type === "asset" || type === "expense";

export const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export type EntrySource = "billing" | "payment" | "suspense" | "manual";

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  source: EntrySource;
  memo: string;
  /** Client number, M-Pesa receipt or the reference typed on a manual entry. */
  reference?: string;
  lines: JournalLine[];
  /** Manual entries only. */
  postedBy?: string;
  reverses?: string;
  reversedBy?: string;
}

export interface Period {
  /** Inclusive "YYYY-MM-DD"; empty means from the beginning. */
  from: string;
  /** Inclusive "YYYY-MM-DD". */
  to: string;
}

const inPeriod = (date: string, p: Period) => (!p.from || date >= p.from) && date <= p.to;

/** Signed so the account's normal side is positive. */
const normalBalance = (acct: Account, debit: number, credit: number) =>
  debitNormal(acct.type) ? debit - credit : credit - debit;

function totalsBy(entries: JournalEntry[], keep: (date: string) => boolean) {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    if (!keep(e.date)) continue;
    for (const l of e.lines) {
      const t = totals.get(l.account) ?? { debit: 0, credit: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      totals.set(l.account, t);
    }
  }
  return totals;
}

/* ---------------- trial balance ---------------- */

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

/** Closing balance of every account with activity, as at `asOf`, on its net side. */
export function trialBalance(entries: JournalEntry[], asOf: string) {
  const totals = totalsBy(entries, (d) => d <= asOf);
  const rows: TrialBalanceRow[] = [];
  for (const acct of ACCOUNTS) {
    const t = totals.get(acct.code);
    if (!t) continue;
    const net = t.debit - t.credit;
    if (net === 0 && t.debit === 0) continue;
    rows.push({ account: acct, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, debit, credit, balanced: debit === credit };
}

/* ---------------- profit & loss ---------------- */

export interface StatementLine {
  account: Account;
  amount: number;
}

export interface StatementSection {
  title: string;
  lines: StatementLine[];
  total: number;
}

function sections(lines: StatementLine[]): StatementSection[] {
  const out: StatementSection[] = [];
  for (const l of lines) {
    let s = out.find((x) => x.title === l.account.section);
    if (!s) out.push((s = { title: l.account.section, lines: [], total: 0 }));
    s.lines.push(l);
    s.total += l.amount;
  }
  return out;
}

function linesOf(totals: Map<string, { debit: number; credit: number }>, type: AccountType): StatementLine[] {
  return ACCOUNTS.filter((a) => a.type === type)
    .map((account) => {
      const t = totals.get(account.code);
      return { account, amount: t ? normalBalance(account, t.debit, t.credit) : 0 };
    })
    .filter((l) => l.amount !== 0);
}

export function profitAndLoss(entries: JournalEntry[], period: Period) {
  const totals = totalsBy(entries, (d) => inPeriod(d, period));
  const income = sections(linesOf(totals, "income"));
  const expenses = sections(linesOf(totals, "expense"));
  const totalIncome = income.reduce((s, x) => s + x.total, 0);
  const totalExpenses = expenses.reduce((s, x) => s + x.total, 0);
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

/* ---------------- balance sheet ---------------- */

/**
 * Position as at `asOf`. Profit to date is not closed into retained earnings by
 * a journal; it's shown as its own equity line so the sheet balances.
 */
export function balanceSheet(entries: JournalEntry[], asOf: string) {
  const totals = totalsBy(entries, (d) => d <= asOf);
  const assets = sections(linesOf(totals, "asset"));
  const liabilities = sections(linesOf(totals, "liability"));
  const equityLines = linesOf(totals, "equity");
  const earnings = profitAndLoss(entries, { from: "", to: asOf }).net;

  const totalAssets = assets.reduce((s, x) => s + x.total, 0);
  const totalLiabilities = liabilities.reduce((s, x) => s + x.total, 0);
  const totalEquity = equityLines.reduce((s, l) => s + l.amount, 0) + earnings;

  return {
    assets,
    liabilities,
    equity: equityLines,
    earnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

/* ---------------- ledgers ---------------- */

export interface LedgerRow {
  entry: JournalEntry;
  line: JournalLine;
  /** Running balance on the account's normal side. */
  balance: number;
}

export function ledger(entries: JournalEntry[], code: string, period: Period) {
  const acct = accountByCode(code);
  if (!acct) return null;
  const sorted = sortEntries(entries);
  let opening = 0;
  let balance = 0;
  const rows: LedgerRow[] = [];
  for (const entry of sorted) {
    for (const line of entry.lines) {
      if (line.account !== code) continue;
      const delta = normalBalance(acct, line.debit, line.credit);
      if (period.from && entry.date < period.from) {
        opening += delta;
        balance += delta;
      } else if (entry.date <= period.to) {
        balance += delta;
        rows.push({ entry, line, balance });
      }
    }
  }
  const debit = rows.reduce((s, r) => s + r.line.debit, 0);
  const credit = rows.reduce((s, r) => s + r.line.credit, 0);
  return { account: acct, opening, closing: balance, debit, credit, rows };
}

/* ---------------- journal ---------------- */

export const sortEntries = (entries: JournalEntry[]) =>
  [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export const entriesIn = (entries: JournalEntry[], period: Period) =>
  sortEntries(entries.filter((e) => inPeriod(e.date, period)));

export const entryTotal = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.debit, 0);

/** Why a proposed manual entry can't be posted, or null if it can. */
export function validateLines(lines: JournalLine[]): string | null {
  if (lines.length < 2) return "An entry needs at least two lines.";
  for (const l of lines) {
    if (!accountByCode(l.account)) return `Unknown account ${l.account}.`;
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0)
      return "Amounts must be whole shillings, zero or more.";
    if ((l.debit > 0) === (l.credit > 0)) return "Each line needs either a debit or a credit.";
  }
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit) return `Debits (${debit}) and credits (${credit}) must be equal.`;
  return null;
}
