"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  BarChart3,
  Banknote,
  Building2,
  CircleAlert,
  CircleCheck,
  Headset,
  Hourglass,
  Plus,
  Receipt,
  Smartphone,
  Truck,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Can } from "@/components/auth/SessionProvider";
import { BarList, ColumnChart } from "@/components/charts/Charts";
import { Chip } from "@/components/ui/Chip";
import { Empty, IconTile, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { arrearsAgeing, monthlyCollection, monthName, pickupsPerTruck } from "@/lib/analytics";
import { fmtDate, initials, kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import {
  balance,
  clientById,
  clientsOf,
  currentMonth,
  monthSum,
  openTicketCount,
  outstandingFor,
  paymentsOf,
  previousMonth,
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
  const month = currentMonth(s);
  const mon = monthName(month);
  const paidLastMonth = monthSum(s, co.id, "payment", previousMonth(month));
  const trend = monthlyCollection(s, clients, 6);
  const ageing = arrearsAgeing(s, clients);
  const perTruck = pickupsPerTruck(s, trucks.map((t) => t.id), 30);
  const delta = paidLastMonth ? Math.round(((paid - paidLastMonth) / paidLastMonth) * 100) : 0;
  const business = clients.filter((c) => c.type === "Business").length;

  return (
    <>
      <PageHead
        title={co.name}
        icon={Building2}
        actions={
          <Can permission="clients.create">
            <Link className="btn primary" href="/company/clients" prefetch={false}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
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
          icon={Users}
          value={clients.length}
          progress={clients.length ? (business / clients.length) * 100 : 0}
          altBar
          sub={`${business} business`}
        />
        <Kpi
          label={`Billed · ${mon}`}
          icon={Receipt}
          iconTone="violet"
          value={kes(billed)}
          progress={100}
          sub="monthly fees"
        />
        <Kpi
          label={`Collected · ${mon}`}
          icon={Banknote}
          iconTone="ok"
          value={kes(paid)}
          progress={rate}
          trend={{ dir: delta >= 0 ? "up" : "down", label: `${Math.abs(delta)}%` }}
          sub={`${rate}% of billing`}
        />
        <Kpi
          label="Outstanding"
          icon={CircleAlert}
          iconTone="bad"
          value={kes(outstanding)}
          progress={billed ? (outstanding / (billed + outstanding)) * 100 : 0}
          sub={`${arrears.length} clients in arrears`}
          tone="bad"
        />
        <Kpi
          label="Trucks live"
          icon={Truck}
          iconTone="sky"
          value={`${live}/${trucks.length}`}
          progress={trucks.length ? (live / trucks.length) * 100 : 0}
          altBar
          sub="sharing location"
        />
        <Kpi
          label="Open tickets"
          icon={Headset}
          iconTone="warn"
          value={openTicketCount(s, (t) => t.company === co.id)}
          sub="care desk"
        />
      </div>

      <div className="grid g3">
        <Panel title="Collection rate by month" icon={BarChart3}>
          <ColumnChart
            caption="Share of each month's billing collected"
            axis={(v) => `${v}%`}
            data={trend.map((r) => ({
              label: monthName(r.month),
              value: r.rate,
              display: `${r.rate}%`,
              note: `${kes(r.paid)} of ${kes(r.billed)}`,
            }))}
          />
        </Panel>
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
          <Link href="/company/arrears" className="panel-link" prefetch={false}>
            Arrears and reminders
            <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </Panel>
        <Panel title="Collections per truck · 30 days" icon={Truck}>
          <BarList
            caption="Stops collected per truck in the last 30 days"
            data={perTruck.map((r) => ({
              label: r.truck,
              value: r.count,
              display: String(r.count),
              note: `${r.count} collections`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid g2">
        <Panel title="Largest balances" icon={TrendingUp}>
          {arrears.length ? (
            <div className="list">
              {arrears.slice(0, 6).map(({ c, b }) => (
                <div className="li" key={c.id}>
                  <div className="li-main">
                    <span className="avatar sm" aria-hidden="true">
                      {initials(c.name)}
                    </span>
                    <div>
                      <div className="t">{c.name}</div>
                      <div className="sub mono">
                        {c.id} · {c.phone}
                      </div>
                    </div>
                  </div>
                  <Chip tone="bad" numeric>
                    {kes(b)}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={CircleCheck}>Everyone is paid up.</Empty>
          )}
        </Panel>

        <Panel title="Latest M-Pesa payments" icon={Smartphone}>
          <div className="list">
            {payments.map((t) => (
              <div className="li" key={t.id + t.date}>
                <div className="li-main">
                  <IconTile icon={ArrowDownLeft} tone="ok" size="sm" />
                  <div>
                    <div className="t">{clientById(s, t.client)?.name}</div>
                    <div className="sub">
                      <span className="mono">{t.id}</span> · {t.channel} · {fmtDate(t.date)}
                    </div>
                  </div>
                </div>
                <span className="num amount in">+{kes(t.amount)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
