"use client";

import { fmtDate, group } from "@/lib/format";
import { buildStatement, PERIODS } from "@/lib/statement";
import type { StatementPeriod } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

export function PeriodSelect() {
  const s = useAppState();
  const actions = useActions();
  return (
    <select
      aria-label="Statement period"
      value={s.stmtPeriod}
      onChange={(e) => actions.setPeriod(e.target.value as StatementPeriod)}
    >
      {PERIODS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/** Running account: opening balance, every entry, closing balance. */
export function StatementTable({ clientId }: { clientId: string }) {
  const s = useAppState();
  const st = buildStatement(s, clientId, s.stmtPeriod);

  return (
    <>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>M-Pesa ref</th>
              <th className="r">Charge</th>
              <th className="r">Paid</th>
              <th className="r">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td className="muted">Opening balance</td>
              <td />
              <td />
              <td />
              <td className="r">{group(st.opening)}</td>
            </tr>
            {st.rows.map(({ txn, running }) => (
              <tr key={txn.id + txn.date}>
                <td className="num">{fmtDate(txn.date)}</td>
                <td>{txn.desc}</td>
                <td className="mono">{txn.kind === "payment" ? txn.id : "—"}</td>
                <td className="r">{txn.kind === "charge" ? group(txn.amount) : ""}</td>
                <td className="r">{txn.kind === "payment" ? group(txn.amount) : ""}</td>
                <td className="r">{group(running)}</td>
              </tr>
            ))}
            <tr className="open">
              <td />
              <td>Closing balance</td>
              <td />
              <td className="r">{group(st.charges)}</td>
              <td className="r">{group(st.payments)}</td>
              <td className="r">{group(st.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Amounts in KES. Positive balance = amount owed; negative = credit carried forward.
      </p>
    </>
  );
}
