"use client";

import { CircleAlert, CircleCheck, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { validateLines, type JournalLine } from "@/lib/accounting";
import { group } from "@/lib/format";
import { AccountSelect } from "./Books";

interface Draft {
  account: string;
  debit: string;
  credit: string;
  memo: string;
}

const blank = (account: string): Draft => ({ account, debit: "", credit: "", memo: "" });

/** Common entries, so nobody has to remember which side fuel goes on. */
const TEMPLATES: { label: string; memo: string; lines: [string, string] }[] = [
  { label: "Expense paid by M-Pesa", memo: "Fuel for route trucks", lines: ["5000", "1000"] },
  { label: "Expense paid from bank", memo: "Monthly wages", lines: ["5100", "1010"] },
  { label: "M-Pesa sweep to bank", memo: "Paybill balance transferred to bank", lines: ["1010", "1000"] },
  { label: "Owner capital", memo: "Capital introduced by owner", lines: ["1010", "3000"] },
];

const toInt = (v: string) => (v.trim() === "" ? 0 : Math.round(Number(v.replace(/,/g, ""))));

export function JournalForm({
  company,
  today,
  onClose,
  onPosted,
}: {
  company: string;
  today: string;
  onClose: () => void;
  onPosted: (id: string) => void;
}) {
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Draft[]>([blank("5000"), blank("1000")]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed: JournalLine[] = lines.map((l) => ({
    account: l.account,
    debit: toInt(l.debit),
    credit: toInt(l.credit),
    memo: l.memo.trim() || undefined,
  }));
  const debit = parsed.reduce((s, l) => s + (Number.isFinite(l.debit) ? l.debit : 0), 0);
  const credit = parsed.reduce((s, l) => s + (Number.isFinite(l.credit) ? l.credit : 0), 0);
  const diff = debit - credit;

  const set = (i: number, patch: Partial<Draft>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    const amount = lines[0]?.debit || lines[0]?.credit || "";
    setMemo(tpl.memo);
    setLines([
      { ...blank(tpl.lines[0]), debit: amount },
      { ...blank(tpl.lines[1]), credit: amount },
    ]);
  };

  /** Put the difference on the last line so the entry balances. */
  const balanceIt = () => {
    const i = lines.length - 1;
    const last = parsed[i];
    const net = last.debit - last.credit - diff;
    set(i, net >= 0 ? { debit: net ? String(net) : "", credit: "" } : { debit: "", credit: String(-net) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = parsed.filter((l) => l.debit || l.credit);
    const problem = validateLines(payload);
    if (problem) return setError(problem);
    if (!memo.trim()) return setError("Describe what the entry is for.");
    setBusy(true);
    setError("");
    const res = await fetch(`/api/finance/${company}/journals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, memo, reference: reference || undefined, lines: payload }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn't post the entry.");
    onPosted(body.id);
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet fin-sheet" role="dialog" aria-modal="true" aria-label="New journal entry" onSubmit={submit}>
        <div className="row between">
          <h2>New journal entry</h2>
          <button type="button" className="btn small ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          For expenses, capital and adjustments. Billing and M-Pesa receipts post themselves.
        </p>

        <div className="fin-templates">
          {TEMPLATES.map((tpl) => (
            <button key={tpl.label} type="button" className="fin-template" onClick={() => applyTemplate(tpl)}>
              {tpl.label}
            </button>
          ))}
        </div>

        <div className="fin-form-top">
          <label className="f">
            Date
            <input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="f">
            Reference <span className="hint">(optional)</span>
            <input maxLength={60} placeholder="Receipt or invoice no." value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="f fin-form-memo">
            Description
            <input required maxLength={200} placeholder="What is this for?" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
        </div>

        <div className="fin-lines">
          <div className="fin-lines-head" aria-hidden="true">
            <span>Account</span>
            <span className="r">Debit</span>
            <span className="r">Credit</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="fin-line-row">
              <div className="fin-line-acct">
                <AccountSelect value={l.account} onChange={(account) => set(i, { account })} label={`Line ${i + 1} account`} />
                <input
                  className="fin-line-memo"
                  placeholder="Line note (optional)"
                  maxLength={120}
                  value={l.memo}
                  onChange={(e) => set(i, { memo: e.target.value })}
                  aria-label={`Line ${i + 1} note`}
                />
              </div>
              <input
                inputMode="numeric"
                className="r"
                placeholder="0"
                aria-label={`Line ${i + 1} debit`}
                value={l.debit}
                onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
              />
              <input
                inputMode="numeric"
                className="r"
                placeholder="0"
                aria-label={`Line ${i + 1} credit`}
                value={l.credit}
                onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
              />
              <button
                type="button"
                className="btn small ghost icon-only"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                disabled={lines.length <= 2}
                aria-label={`Remove line ${i + 1}`}
              >
                <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="fin-lines-foot">
            <button type="button" className="btn small ghost" onClick={() => setLines((ls) => [...ls, blank("5900")])}>
              <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
              Add line
            </button>
            <span className="r mono">{group(debit)}</span>
            <span className="r mono">{group(credit)}</span>
            <span />
          </div>
        </div>

        <div className={`fin-balance ${diff === 0 && debit > 0 ? "ok" : "off"}`}>
          {diff === 0 && debit > 0 ? (
            <>
              <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
              Balanced · KES {group(debit)}
            </>
          ) : (
            <>
              <CircleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
              {debit === 0 && credit === 0 ? "Enter the amounts." : `Out by KES ${group(Math.abs(diff))}`}
              {diff !== 0 && (
                <button type="button" className="linklike" onClick={balanceIt}>
                  Balance on last line
                </button>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="err" role="alert">
            <CircleAlert size={15} strokeWidth={2.2} aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || diff !== 0 || debit === 0}>
            {busy ? "Posting…" : "Post entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
