"use client";

import { BellRing, CircleCheck, Hourglass, LoaderCircle, Send, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/SessionProvider";
import { BarList } from "@/components/charts/Charts";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { arrearsAgeing } from "@/lib/analytics";
import { kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { clientsOf } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

type Stage = "sms" | "stk" | "warn";

const STAGE: Record<Stage, string> = {
  sms: "SMS reminder",
  stk: "M-Pesa prompt",
  warn: "Service warning",
};

interface Row {
  client: string;
  name: string;
  phone: string;
  balance: number;
  daysOverdue: number;
  due: Stage | null;
  sent: Stage[];
}

interface Policy {
  enabled: boolean;
  smsAfterDays: number;
  stkAfterDays: number;
  warnAfterDays: number;
  minBalance: number;
}

/** Who owes what, for how long, and what the next reminder run would send. */
export function CompanyArrears() {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const co = companyById(s.companyId);
  const [data, setData] = useState<{ rows: Row[]; policy: Policy } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reminders?company=${co.id}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [co.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const due = data?.rows.filter((r) => r.due) ?? [];

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/reminders?company=${co.id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error ?? "Could not send reminders.");
        return;
      }
      const ok = body.sent.filter((x: { ok: boolean }) => x.ok).length;
      toast(`${ok} reminder${ok === 1 ? "" : "s"} sent${body.sent.length > ok ? `, ${body.sent.length - ok} failed` : ""}`);
      await Promise.all([load(), actions.refresh()]);
    } finally {
      setBusy(false);
    }
  };

  const ageing = arrearsAgeing(s, clientsOf(s, co.id));

  return (
    <>
      <PageHead
        title="Arrears & reminders"
        icon={Hourglass}
        actions={
          <Can permission="reminders.manage">
            <button type="button" className="btn primary" onClick={run} disabled={busy || due.length === 0}>
              {busy ? (
                <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Send size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
              Send {due.length} due reminder{due.length === 1 ? "" : "s"}
            </button>
          </Can>
        }
      >
        Reminders escalate once per month: an SMS, then an M-Pesa payment prompt, then a service warning.
      </PageHead>

      <div className="grid g-main">
        <Panel title="Clients in arrears" icon={BellRing}>
          {!data ? (
            <Empty icon={LoaderCircle}>Loading…</Empty>
          ) : data.rows.length === 0 ? (
            <Empty icon={CircleCheck}>Everyone is paid up.</Empty>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="r">Balance</th>
                    <th className="r">Overdue</th>
                    <th>Next reminder</th>
                    <th>Sent this month</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.client}>
                      <td>
                        {r.name}
                        <div className="hint mono">{r.client}</div>
                      </td>
                      <td className="r">{kes(r.balance)}</td>
                      <td className="r">{r.daysOverdue} days</td>
                      <td>{r.due ? <Chip tone="warn">{STAGE[r.due]}</Chip> : <span className="hint">—</span>}</td>
                      <td className="hint">{r.sent.map((x) => STAGE[x]).join(", ") || "Nothing yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="stack" style={{ gap: 20 }}>
          <Panel title="Arrears by age" icon={Hourglass}>
            <BarList
              caption="Outstanding balances by how long they've been owed"
              data={ageing.map((b) => ({
                label: b.label,
                value: b.amount,
                display: kes(b.amount),
                note: `${b.clients} client${b.clients === 1 ? "" : "s"}`,
              }))}
            />
          </Panel>
          {data && (
            <Panel title="Reminder policy" icon={Settings}>
              <div className="list">
                <div className="li">
                  <span>Automatic daily run</span>
                  <Chip tone={data.policy.enabled ? "ok" : "neutral"}>{data.policy.enabled ? "On" : "Off"}</Chip>
                </div>
                <div className="li">
                  <span>SMS after</span>
                  <b>{data.policy.smsAfterDays} days</b>
                </div>
                <div className="li">
                  <span>M-Pesa prompt after</span>
                  <b>{data.policy.stkAfterDays} days</b>
                </div>
                <div className="li">
                  <span>Service warning after</span>
                  <b>{data.policy.warnAfterDays} days</b>
                </div>
                <div className="li">
                  <span>Ignore balances below</span>
                  <b>{kes(data.policy.minBalance)}</b>
                </div>
              </div>
              <Can permission="settings.company.manage">
                <Link href="/company/settings" className="panel-link" prefetch={false}>
                  Change in Settings
                </Link>
              </Can>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
