"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarRange, CornerDownRight, Sigma } from "lucide-react";
import { fmtDate, group } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { buildStatement, PERIODS } from "@/lib/statement";
import type { StatementPeriod } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

export function PeriodSelect() {
  const s = useAppState();
  const actions = useActions();
  const { t } = useT();
  return (
    <label className="select-ico">
      <CalendarRange size={15} strokeWidth={2.2} aria-hidden="true" />
      <select
        aria-label={t("Statement period")}
        value={s.stmtPeriod}
        onChange={(e) => actions.setPeriod(e.target.value as StatementPeriod)}
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {t(p.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Running account: opening balance, every entry, closing balance. */
export function StatementTable({ clientId }: { clientId: string }) {
  const s = useAppState();
  const st = buildStatement(s, clientId, s.stmtPeriod);
  const { t } = useT();

  return (
    <>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{t("Date")}</th>
              <th>{t("Description")}</th>
              <th>{t("M-Pesa ref")}</th>
              <th className="r">{t("Charge")}</th>
              <th className="r">{t("Paid")}</th>
              <th className="r">{t("Balance")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td className="muted">
                <span className="with-ico">
                  <CornerDownRight size={14} strokeWidth={2.2} aria-hidden="true" />
                  {t("Opening balance")}
                </span>
              </td>
              <td />
              <td />
              <td />
              <td className="r">{group(st.opening)}</td>
            </tr>
            {st.rows.map(({ txn, running }) => (
              <tr key={txn.id + txn.date}>
                <td className="num">{fmtDate(txn.date)}</td>
                <td>
                  <span className="with-ico">
                    <span className={`txn-ico ${txn.kind}`} aria-hidden="true">
                      {txn.kind === "payment" ? (
                        <ArrowDownLeft size={13} strokeWidth={2.4} />
                      ) : (
                        <ArrowUpRight size={13} strokeWidth={2.4} />
                      )}
                    </span>
                    {txn.desc}
                  </span>
                </td>
                <td className="mono">{txn.kind === "payment" ? txn.id : "—"}</td>
                <td className="r">{txn.kind === "charge" ? group(txn.amount) : ""}</td>
                <td className="r">{txn.kind === "payment" ? group(txn.amount) : ""}</td>
                <td className="r">{group(running)}</td>
              </tr>
            ))}
            <tr className="open">
              <td />
              <td>
                <span className="with-ico">
                  <Sigma size={14} strokeWidth={2.2} aria-hidden="true" />
                  {t("Closing balance")}
                </span>
              </td>
              <td />
              <td className="r">{group(st.charges)}</td>
              <td className="r">{group(st.payments)}</td>
              <td className="r">{group(st.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        {t("Amounts in KES. Positive balance = amount owed; negative = credit carried forward.")}
      </p>
    </>
  );
}
