import { MONTHS, pad } from "./format";
import { nowIn } from "./selectors";
import type { AppState, Client, Txn } from "./types";

/*
 * Trend figures for the dashboards, computed from the session's snapshot.
 * "Diverted" = recyclable + organic (kept out of the dump site);
 * "landfill" = mixed + residual.
 */

const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d: Date) => ymd(d).slice(0, 7);

/** The last `n` months, oldest first, as "2026-09". */
export function lastMonths(s: AppState, n: number): string[] {
  const now = nowIn(s);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}

export const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]}`;

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September 2026" */
export const monthLabelLong = (m: string) => `${LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

/** Billed and collected per month for a set of clients. */
export function monthlyCollection(s: AppState, clients: Client[], months = 6) {
  const ids = new Set(clients.map((c) => c.id));
  const txns = s.txns.filter((t) => ids.has(t.client));
  return lastMonths(s, months)
    .map((m) => {
      const billed = txns.filter((t) => t.kind === "charge" && t.date.startsWith(m)).reduce((a, t) => a + t.amount, 0);
      const paid = txns.filter((t) => t.kind === "payment" && t.date.startsWith(m)).reduce((a, t) => a + t.amount, 0);
      return { month: m, billed, paid, rate: billed ? Math.round((paid / billed) * 100) : 0 };
    })
    .filter((r) => r.billed > 0 || r.paid > 0);
}

/** Days since the oldest charge payments haven't covered (oldest paid first). */
export function daysOverdue(txns: Txn[], today: string): number {
  const charges = txns.filter((x) => x.kind === "charge").sort((a, b) => a.date.localeCompare(b.date));
  let paid = txns.filter((x) => x.kind === "payment").reduce((a, x) => a + x.amount, 0);
  for (const c of charges) {
    if (paid >= c.amount) {
      paid -= c.amount;
      continue;
    }
    const from = new Date(`${c.date.slice(0, 10)}T00:00:00`).getTime();
    const to = new Date(`${today}T00:00:00`).getTime();
    return Math.max(0, Math.round((to - from) / 86_400_000));
  }
  return 0;
}

export const AGE_BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

/** Outstanding balances grouped by how long they've been owed. */
export function arrearsAgeing(s: AppState, clients: Client[]) {
  const today = ymd(nowIn(s));
  const buckets = AGE_BUCKETS.map((label) => ({ label, amount: 0, clients: 0 }));
  for (const c of clients) {
    const mine = s.txns.filter((t) => t.client === c.id);
    const bal = mine.reduce((b, t) => b + (t.kind === "charge" ? t.amount : -t.amount), 0);
    if (bal <= 0) continue;
    const d = daysOverdue(mine, today);
    const i = d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3;
    buckets[i].amount += bal;
    buckets[i].clients += 1;
  }
  return buckets;
}

/** Collections per truck over the last `days` days. */
export function pickupsPerTruck(s: AppState, truckIds: string[], days = 30) {
  const since = ymd(new Date(nowIn(s).getTime() - days * 86_400_000));
  return truckIds.map((id) => ({
    truck: id,
    count: s.pickups.filter((p) => p.truck === id && p.when >= since && p.status === "Collected").length,
  }));
}

const DIVERTED = new Set(["recyclable", "organic"]);

/** Weekly kilograms, diverted vs landfill, for the last `weeks` weeks (Mon-start). */
export function weeklyDiversion(s: AppState, clientIds: Set<string> | null, weeks = 8) {
  const now = nowIn(s);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const rows = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const a = ymd(start);
    const b = ymd(end);
    let diverted = 0;
    let landfill = 0;
    for (const p of s.pickups) {
      if (p.weightKg === undefined || p.when < a || p.when >= b) continue;
      if (clientIds && !clientIds.has(p.client)) continue;
      if (p.stream && DIVERTED.has(p.stream)) diverted += p.weightKg;
      else landfill += p.weightKg;
    }
    rows.push({ label: `${start.getDate()} ${MONTHS[start.getMonth()]}`, diverted, landfill });
  }
  return rows;
}

/** Totals for a period: kilograms, diversion rate. */
export function impactTotals(s: AppState, clientIds: Set<string> | null, sinceDays = 30) {
  const since = ymd(new Date(nowIn(s).getTime() - sinceDays * 86_400_000));
  let total = 0;
  let diverted = 0;
  let pickups = 0;
  for (const p of s.pickups) {
    if (p.weightKg === undefined || p.when < since) continue;
    if (clientIds && !clientIds.has(p.client)) continue;
    total += p.weightKg;
    pickups += 1;
    if (p.stream && DIVERTED.has(p.stream)) diverted += p.weightKg;
  }
  return { total, diverted, pickups, rate: total ? Math.round((diverted / total) * 100) : 0 };
}

export const fmtKg = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10_000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;
