import { txFor } from "./selectors";
import type { AppState, StatementPeriod, Txn } from "./types";

export const PERIODS: { value: StatementPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "2026-07", label: "Jul 2026" },
  { value: "2026-08", label: "Aug 2026" },
  { value: "2026-09", label: "Sep 2026" },
];

export interface StatementRow {
  txn: Txn;
  /** Running balance after this entry. */
  running: number;
}

export interface Statement {
  opening: number;
  rows: StatementRow[];
  charges: number;
  payments: number;
  closing: number;
}

/** Running account for one client, optionally narrowed to a single month. */
export function buildStatement(
  s: AppState,
  clientId: string,
  period: StatementPeriod,
): Statement {
  const all = txFor(s, clientId);
  const signed = (t: Txn) => (t.kind === "charge" ? t.amount : -t.amount);

  const opening =
    period === "all"
      ? 0
      : all.filter((t) => t.date < period).reduce((b, t) => b + signed(t), 0);
  const entries = period === "all" ? all : all.filter((t) => t.date.startsWith(period));

  let running = opening;
  const rows = entries.map((txn) => {
    running += signed(txn);
    return { txn, running };
  });

  return {
    opening,
    rows,
    charges: entries.filter((t) => t.kind === "charge").reduce((a, t) => a + t.amount, 0),
    payments: entries.filter((t) => t.kind === "payment").reduce((a, t) => a + t.amount, 0),
    closing: running,
  };
}
