"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Fragment } from "react";
import {
  balanceSheet,
  profitAndLoss,
  trialBalance,
  TYPE_LABEL,
  type AccountType,
  type JournalEntry,
  type Period,
  type StatementSection,
} from "@/lib/accounting";
import { fmtDate } from "@/lib/format";
import { money, side } from "./money";

function Balanced({ ok, what }: { ok: boolean; what: string }) {
  return ok ? (
    <span className="chip ok">
      <CircleCheck size={13} strokeWidth={2.4} aria-hidden="true" />
      {what} balances
    </span>
  ) : (
    <span className="chip bad">
      <CircleAlert size={13} strokeWidth={2.4} aria-hidden="true" />
      {what} out of balance
    </span>
  );
}

/* ---------------- trial balance ---------------- */

export function TrialBalanceView({
  entries,
  asOf,
  onAccount,
}: {
  entries: JournalEntry[];
  asOf: string;
  onAccount: (code: string) => void;
}) {
  const tb = trialBalance(entries, asOf);
  const types = [...new Set(tb.rows.map((r) => r.account.type))] as AccountType[];

  return (
    <div className="fin-report">
      <div className="fin-report-head">
        <div>
          <h2>Trial balance</h2>
          <p className="hint">As at {fmtDate(asOf)}</p>
        </div>
        <Balanced ok={tb.balanced} what="Trial balance" />
      </div>
      <div className="tablewrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th className="r">Debit</th>
              <th className="r">Credit</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <Fragment key={type}>
                <tr className="fin-group">
                  <td colSpan={4}>{TYPE_LABEL[type]}</td>
                </tr>
                {tb.rows
                  .filter((r) => r.account.type === type)
                  .map((r) => (
                    <tr key={r.account.code} className="click" onClick={() => onAccount(r.account.code)}>
                      <td className="mono">{r.account.code}</td>
                      <td>{r.account.name}</td>
                      <td className="r">{side(r.debit)}</td>
                      <td className="r">{side(r.credit)}</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="fin-total">
              <td colSpan={2}>Total</td>
              <td className="r">{money(tb.debit)}</td>
              <td className="r">{money(tb.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export const trialBalanceCsv = (entries: JournalEntry[], asOf: string) => {
  const tb = trialBalance(entries, asOf);
  return [
    ["Trial balance as at", asOf],
    ["Code", "Account", "Type", "Debit", "Credit"],
    ...tb.rows.map((r) => [r.account.code, r.account.name, r.account.type, r.debit, r.credit]),
    ["", "Total", "", tb.debit, tb.credit],
  ];
};

/* ---------------- statements ---------------- */

function SectionRows({ sections, onAccount }: { sections: StatementSection[]; onAccount: (code: string) => void }) {
  return (
    <>
      {sections.map((s) => (
        <Fragment key={s.title}>
          <tr className="fin-group">
            <td colSpan={2}>{s.title}</td>
          </tr>
          {s.lines.map((l) => (
            <tr key={l.account.code} className="click" onClick={() => onAccount(l.account.code)}>
              <td className="fin-indent">
                <span className="mono muted">{l.account.code}</span> {l.account.name}
              </td>
              <td className="r">{money(l.amount)}</td>
            </tr>
          ))}
          {sections.length > 1 && (
            <tr className="fin-subtotal">
              <td>Total {s.title.toLowerCase()}</td>
              <td className="r">{money(s.total)}</td>
            </tr>
          )}
        </Fragment>
      ))}
    </>
  );
}

function Total({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <tr className={strong ? "fin-total strong" : "fin-total"}>
      <td>{label}</td>
      <td className="r">{money(amount)}</td>
    </tr>
  );
}

export function ProfitLossView({
  entries,
  period,
  onAccount,
}: {
  entries: JournalEntry[];
  period: Period;
  onAccount: (code: string) => void;
}) {
  const pl = profitAndLoss(entries, period);
  const margin = pl.totalIncome ? Math.round((pl.net / pl.totalIncome) * 100) : 0;

  return (
    <div className="fin-report">
      <div className="fin-report-head">
        <div>
          <h2>Profit &amp; loss</h2>
          <p className="hint">
            {period.from ? `${fmtDate(period.from)} – ${fmtDate(period.to)}` : `Up to ${fmtDate(period.to)}`}
          </p>
        </div>
        <span className={`chip ${pl.net >= 0 ? "ok" : "bad"}`}>
          {pl.net >= 0 ? "Profit" : "Loss"} · {margin}% margin
        </span>
      </div>
      <div className="tablewrap">
        <table className="fin-table fin-statement">
          <tbody>
            <SectionRows sections={pl.income} onAccount={onAccount} />
            <Total label="Total income" amount={pl.totalIncome} />
            {pl.expenses.length > 0 ? (
              <SectionRows sections={pl.expenses} onAccount={onAccount} />
            ) : (
              <tr className="fin-group">
                <td colSpan={2}>
                  Operating expenses <span className="hint">· none posted yet — record them as journal entries</span>
                </td>
              </tr>
            )}
            <Total label="Total expenses" amount={pl.totalExpenses} />
            <Total label={pl.net >= 0 ? "Net profit" : "Net loss"} amount={pl.net} strong />
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const profitLossCsv = (entries: JournalEntry[], period: Period) => {
  const pl = profitAndLoss(entries, period);
  const rows: (string | number)[][] = [["Profit & loss", period.from || "beginning", period.to]];
  for (const s of [...pl.income, ...pl.expenses]) {
    rows.push([s.title]);
    for (const l of s.lines) rows.push([l.account.code, l.account.name, l.amount]);
  }
  rows.push(["", "Total income", pl.totalIncome], ["", "Total expenses", pl.totalExpenses], ["", "Net", pl.net]);
  return rows;
};

export function BalanceSheetView({
  entries,
  asOf,
  onAccount,
}: {
  entries: JournalEntry[];
  asOf: string;
  onAccount: (code: string) => void;
}) {
  const bs = balanceSheet(entries, asOf);

  return (
    <div className="fin-report">
      <div className="fin-report-head">
        <div>
          <h2>Balance sheet</h2>
          <p className="hint">As at {fmtDate(asOf)}</p>
        </div>
        <Balanced ok={bs.balanced} what="Balance sheet" />
      </div>
      <div className="fin-bs">
        <div className="tablewrap">
          <table className="fin-table fin-statement">
            <tbody>
              <SectionRows sections={bs.assets} onAccount={onAccount} />
              <Total label="Total assets" amount={bs.totalAssets} strong />
            </tbody>
          </table>
        </div>
        <div className="tablewrap">
          <table className="fin-table fin-statement">
            <tbody>
              {bs.liabilities.length > 0 ? (
                <SectionRows sections={bs.liabilities} onAccount={onAccount} />
              ) : (
                <tr className="fin-group">
                  <td colSpan={2}>Liabilities</td>
                </tr>
              )}
              <Total label="Total liabilities" amount={bs.totalLiabilities} />
              <tr className="fin-group">
                <td colSpan={2}>Equity</td>
              </tr>
              {bs.equity.map((l) => (
                <tr key={l.account.code} className="click" onClick={() => onAccount(l.account.code)}>
                  <td className="fin-indent">
                    <span className="mono muted">{l.account.code}</span> {l.account.name}
                  </td>
                  <td className="r">{money(l.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="fin-indent">Profit to date</td>
                <td className="r">{money(bs.earnings)}</td>
              </tr>
              <Total label="Total equity" amount={bs.totalEquity} />
              <Total label="Total liabilities & equity" amount={bs.totalLiabilities + bs.totalEquity} strong />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const balanceSheetCsv = (entries: JournalEntry[], asOf: string) => {
  const bs = balanceSheet(entries, asOf);
  const rows: (string | number)[][] = [["Balance sheet as at", asOf]];
  for (const s of [...bs.assets, ...bs.liabilities]) {
    rows.push([s.title]);
    for (const l of s.lines) rows.push([l.account.code, l.account.name, l.amount]);
  }
  rows.push(["Equity"]);
  for (const l of bs.equity) rows.push([l.account.code, l.account.name, l.amount]);
  rows.push(
    ["", "Profit to date", bs.earnings],
    ["", "Total assets", bs.totalAssets],
    ["", "Total liabilities", bs.totalLiabilities],
    ["", "Total equity", bs.totalEquity],
  );
  return rows;
};
