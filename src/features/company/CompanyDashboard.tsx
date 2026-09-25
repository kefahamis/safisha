"use client";

import Link from "next/link";
import { Can } from "@/components/auth/SessionProvider";
import { Chip } from "@/components/ui/Chip";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate, kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import {
  balance,
  clientById,
  clientsOf,
  monthSum,
  openTicketCount,
  outstandingFor,
  paymentsOf,
  trucksOf,
} from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function CompanyDashboard() {
  const s = useAppState();
  const co = companyById(s.companyId);

  const clients = clientsOf(s, co.id);
  const billed = monthSum(s, co.id, "charge");
  const paid = monthSum(s, co.id, "payment");
  const outstanding = outstandingFor(s, clients);
  const arrears = clients
    .map((c) => ({ c, b: balance(s, c.id) }))
    .filter((x) => x.b > 0)
    .sort((a, b) => b.b - a.b);
  const payments = paymentsOf(s, co.id).slice(0, 6);
  const trucks = trucksOf(s, co.id);
  const live = trucks.filter((t) => t.status !== "offline" && t.sharing).length;

  const rate = billed ? Math.round((paid / billed) * 100) : 0;
  const paidLastMonth = monthSum(s, co.id, "payment", "2026-08");
  const delta = paidLastMonth ? Math.round(((paid - paidLastMonth) / paidLastMonth) * 100) : 0;
  const business = clients.filter((c) => c.type === "Business").length;

  return (
    <>
      <PageHead
        title={co.name}
        actions={
          <Can permission="clients.create">
            <Link className="btn primary" href="/company/clients" prefetch={false}>
              Add client
            </Link>
          </Can>
        }
      >
        Paybill <span className="mono">{co.paybill}</span> · Serving{" "}
        {co.estates.map(estateName).join(", ")}
      </PageHead>

      <div className="kpis">
        <Kpi
          label="Active clients"
          value={clients.length}
          progress={clients.length ? (business / clients.length) * 100 : 0}
          altBar
          sub={`${business} business`}
        />
        <Kpi label="Billed · Sep" value={kes(billed)} progress={100} sub="monthly fees" />
        <Kpi
          label="Collected · Sep"
          value={kes(paid)}
          progress={rate}
          trend={{ dir: delta >= 0 ? "up" : "down", label: `${Math.abs(delta)}%` }}
          sub={`${rate}% of billing`}
        />
        <Kpi
          label="Outstanding"
          value={kes(outstanding)}
          progress={billed ? (outstanding / (billed + outstanding)) * 100 : 0}
          sub={`${arrears.length} clients in arrears`}
          tone="bad"
        />
        <Kpi
          label="Trucks live"
          value={`${live}/${trucks.length}`}
          progress={trucks.length ? (live / trucks.length) * 100 : 0}
          altBar
          sub="sharing location"
        />
        <Kpi
          label="Open tickets"
          value={openTicketCount(s, (t) => t.company === co.id)}
          sub="care desk"
        />
      </div>

      <div className="grid g2">
        <Panel title="Largest balances">
          {arrears.length ? (
            <div className="list">
              {arrears.slice(0, 6).map(({ c, b }) => (
                <div className="li" key={c.id}>
                  <div>
                    <div className="t">{c.name}</div>
                    <div className="sub mono">
                      {c.id} · {c.phone}
                    </div>
                  </div>
                  <Chip tone="bad" numeric>
                    {kes(b)}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Everyone is paid up.</Empty>
          )}
        </Panel>

        <Panel title="Latest M-Pesa payments">
          <div className="list">
            {payments.map((t) => (
              <div className="li" key={t.id + t.date}>
                <div>
                  <div className="t">{clientById(s, t.client)?.name}</div>
                  <div className="sub">
                    <span className="mono">{t.id}</span> · {t.channel} · {fmtDate(t.date)}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 700, color: "var(--ok)" }}>
                  {kes(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
