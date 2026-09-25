"use client";

import { Search, Undo2 } from "lucide-react";
import { useState } from "react";
import { Empty } from "@/components/ui/Panel";
import { PAGE_SIZES, Pagination } from "@/components/ui/Pagination";
import {
  ACCOUNTS,
  accountByCode,
  entriesIn,
  ledger,
  TYPE_LABEL,
  type AccountType,
  type EntrySource,
  type JournalEntry,
  type Period,
} from "@/lib/accounting";
import { fmtDate } from "@/lib/format";
import { money, side } from "./money";

export const SOURCE_LABEL: Record<EntrySource, string> = {
  billing: "Billing",
  payment: "M-Pesa receipt",
  suspense: "Unmatched receipt",
  manual: "Manual",
};

const SOURCE_TONE: Record<EntrySource, string> = {
  billing: "neutral",
  payment: "ok",
  suspense: "warn",
  manual: "accent",
};

/** Page state for a long list; snaps back to page one when the list changes shape. */
function usePaged<T>(items: T[], resetKey: string) {
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  return {
    rows: items.slice((current - 1) * pageSize, current * pageSize),
    pager:
      items.length > PAGE_SIZES[0] ? (
        <Pagination
          page={current}
          pageSize={pageSize}
          total={items.length}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          noun="entries"
        />
      ) : null,
  };
}

/* ---------------- journal ---------------- */

export function filterJournal(entries: JournalEntry[], period: Period, source: string, q: string) {
  const needle = q.trim().toLowerCase();
  return entriesIn(entries, period)
    .filter((e) => !source || e.source === source)
    .filter(
      (e) =>
        !needle ||
        `${e.id} ${e.memo} ${e.reference ?? ""} ${e.lines.map((l) => accountByCode(l.account)?.name).join(" ")}`
          .toLowerCase()
          .includes(needle),
    )
    .reverse();
}

export function JournalView({
  entries,
  period,
  q,
  onQuery,
  source,
  onSource,
  canPost,
  onReverse,
  onAccount,
}: {
  entries: JournalEntry[];
  period: Period;
  q: string;
  onQuery: (q: string) => void;
  source: string;
  onSource: (s: string) => void;
  canPost: boolean;
  onReverse: (id: string) => void;
  onAccount: (code: string) => void;
}) {
  const list = filterJournal(entries, period, source, q);
  const { rows, pager } = usePaged(list, `${period.from}|${period.to}|${source}|${q}`);

  return (
    <div className="fin-report">
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="search" style={{ flex: 1, minWidth: 180 }}>
          <Search size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search entry no., memo, client or account"
            aria-label="Search journal"
            value={q}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        <select aria-label="Source" value={source} onChange={(e) => onSource(e.target.value)}>
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABEL) as EntrySource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon={Search}>No journal entries match.</Empty>
      ) : (
        <>
          <div className="tablewrap">
            <table className="fin-table fin-journal">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Account</th>
                  <th className="r">Debit</th>
                  <th className="r">Credit</th>
                </tr>
              </thead>
              {rows.map((e) => (
                <tbody key={e.id} className="fin-entry">
                  <tr className="fin-entry-head">
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td colSpan={4}>
                      <div className="fin-entry-title">
                        <span className="mono">{e.id}</span>
                        <span className={`chip ${SOURCE_TONE[e.source]}`}>{SOURCE_LABEL[e.source]}</span>
                        {e.reversedBy && <span className="chip neutral">Reversed by {e.reversedBy}</span>}
                        <span className="fin-memo">{e.memo}</span>
                        {e.reference && <span className="hint mono">{e.reference}</span>}
                        {canPost && e.source === "manual" && !e.reverses && !e.reversedBy && (
                          <button
                            type="button"
                            className="btn small ghost fin-reverse"
                            onClick={() => onReverse(e.id)}
                            title="Post a mirror-image entry that cancels this one"
                          >
                            <Undo2 size={14} strokeWidth={2.2} aria-hidden="true" />
                            Reverse
                          </button>
                        )}
                      </div>
                      {e.postedBy && <div className="hint">Posted by {e.postedBy}</div>}
                    </td>
                  </tr>
                  {e.lines.map((l, i) => (
                      <tr key={i} className="fin-line">
                        <td />
                        <td />
                        <td className={l.credit ? "fin-cr" : undefined}>
                          <button type="button" className="linklike" onClick={() => onAccount(l.account)}>
                            <span className="mono muted">{l.account}</span> {accountByCode(l.account)?.name}
                          </button>
                          {l.memo && <div className="hint">{l.memo}</div>}
                        </td>
                        <td className="r">{side(l.debit)}</td>
                        <td className="r">{side(l.credit)}</td>
                      </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          {pager}
        </>
      )}
    </div>
  );
}

export const journalCsv = (list: JournalEntry[]) => [
  ["Date", "Entry", "Source", "Memo", "Reference", "Account", "Account name", "Debit", "Credit"],
  ...list.flatMap((e) =>
    e.lines.map((l) => [
      e.date,
      e.id,
      SOURCE_LABEL[e.source],
      e.memo,
      e.reference ?? "",
      l.account,
      accountByCode(l.account)?.name ?? "",
      l.debit,
      l.credit,
    ]),
  ),
];

/* ---------------- ledgers ---------------- */

export function AccountSelect({
  value,
  onChange,
  id,
  label = "Account",
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  label?: string;
}) {
  const types = [...new Set(ACCOUNTS.map((a) => a.type))] as AccountType[];
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {types.map((type) => (
        <optgroup key={type} label={TYPE_LABEL[type]}>
          {ACCOUNTS.filter((a) => a.type === type).map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function LedgerView({
  entries,
  period,
  account,
  onAccount,
  onEntry,
}: {
  entries: JournalEntry[];
  period: Period;
  account: string;
  onAccount: (code: string) => void;
  onEntry: (id: string) => void;
}) {
  const lg = ledger(entries, account, period);
  const { rows, pager } = usePaged(lg?.rows ?? [], `${account}|${period.from}|${period.to}`);
  if (!lg) return null;

  return (
    <div className="fin-report">
      <div className="fin-report-head">
        <div className="row">
          <AccountSelect value={account} onChange={onAccount} />
        </div>
        <div className="fin-ledger-sum">
          <span>
            Opening <b>{money(lg.opening)}</b>
          </span>
          <span>
            Debits <b>{money(lg.debit)}</b>
          </span>
          <span>
            Credits <b>{money(lg.credit)}</b>
          </span>
          <span>
            Closing <b>{money(lg.closing)}</b>
          </span>
        </div>
      </div>
      <div className="tablewrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Description</th>
              <th className="r">Debit</th>
              <th className="r">Credit</th>
              <th className="r">Balance</th>
            </tr>
          </thead>
          <tbody>
            {period.from && (
              <tr className="fin-group">
                <td className="nowrap">{fmtDate(period.from)}</td>
                <td colSpan={4}>Opening balance</td>
                <td className="r">{money(lg.opening)}</td>
              </tr>
            )}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  No postings to this account in the period.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.entry.id}-${i}`}>
                  <td className="nowrap">{fmtDate(r.entry.date)}</td>
                  <td>
                    <button type="button" className="linklike mono" onClick={() => onEntry(r.entry.id)}>
                      {r.entry.id}
                    </button>
                  </td>
                  <td>
                    {r.line.memo ?? r.entry.memo}
                    {r.entry.reference && <span className="hint mono"> · {r.entry.reference}</span>}
                  </td>
                  <td className="r">{side(r.line.debit)}</td>
                  <td className="r">{side(r.line.credit)}</td>
                  <td className="r">{money(r.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="fin-total">
              <td colSpan={3}>Closing balance · {fmtDate(period.to)}</td>
              <td className="r">{money(lg.debit)}</td>
              <td className="r">{money(lg.credit)}</td>
              <td className="r">{money(lg.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {pager}
    </div>
  );
}

export const ledgerCsv = (entries: JournalEntry[], account: string, period: Period) => {
  const lg = ledger(entries, account, period);
  if (!lg) return [];
  return [
    [`Ledger ${lg.account.code} ${lg.account.name}`, period.from || "beginning", period.to],
    ["Date", "Entry", "Description", "Reference", "Debit", "Credit", "Balance"],
    ["", "", "Opening balance", "", "", "", lg.opening],
    ...lg.rows.map((r) => [
      r.entry.date,
      r.entry.id,
      r.line.memo ?? r.entry.memo,
      r.entry.reference ?? "",
      r.line.debit,
      r.line.credit,
      r.balance,
    ]),
    ["", "", "Closing balance", "", lg.debit, lg.credit, lg.closing],
  ];
};
