"use client";

import {
  ArrowUpRight,
  BarChart3,
  Banknote,
  Building2,
  CircleAlert,
  Globe2,
  Recycle,
  Truck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { BarList, ColumnChart, StackedColumns } from "@/components/charts/Charts";
import { Chip, CompanyTag } from "@/components/ui/Chip";
import { Kpi, PageHead, Panel } from "@/components/ui/Panel";
import {
  fmtKg,
  impactTotals,
  monthLabelLong,
  monthlyCollection,
  monthName,
  weeklyDiversion,
} from "@/lib/analytics";
import { group, kes } from "@/lib/format";
import { COMPANIES } from "@/lib/reference/companies";
import { ESTATES, estateName } from "@/lib/reference/estates";
import { currentMonth, monthSum, openTicketCount, outstandingFor, previousMonth } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

export function AdminOverview() {
  const s = useAppState();
  const actions = useActions();
  const router = useRouter();

  const billed = COMPANIES.reduce((a, c) => a + monthSum(s, c.id, "charge"), 0);
  const paid = COMPANIES.reduce((a, c) => a + monthSum(s, c.id, "payment"), 0);
  const outstanding = outstandingFor(s, s.clients);
  const live = s.trucks.filter((t) => t.status !== "offline" && t.sharing).length;

  const rate = billed ? Math.round((paid / billed) * 100) : 0;
  const month = currentMonth(s);
  const mon = monthName(month);
  const paidLastMonth = COMPANIES.reduce((a, c) => a + monthSum(s, c.id, "payment", previousMonth(month)), 0);
  const trend = monthlyCollection(s, s.clients, 6);
  const impact = impactTotals(s, null, 30);
  const delta = paidLastMonth ? Math.round(((paid - paidLastMonth) / paidLastMonth) * 100) : 0;

  const openCompany = (id: string) => {
    actions.selectCompany(id);
    router.push("/company");
  };

  return (
    <>
      <PageHead title="City overview" icon={Globe2}>
        All licensed collection companies on the platform · {monthLabelLong(month)}.
      </PageHead>

      <div className="kpis">
        <Kpi
          label="Companies"
          icon={Building2}
          iconTone="violet"
          value={COMPANIES.length}
          sub={`${Object.keys(ESTATES).length} estates covered`}
        />
        <Kpi label="Clients" icon={Users} value={s.clients.length} sub="unique numbers issued" />
        <Kpi
          label={`Collected · ${mon}`}
          icon={Banknote}
          iconTone="ok"
          value={kes(paid)}
          progress={rate}
          trend={{ dir: delta >= 0 ? "up" : "down", label: `${Math.abs(delta)}%` }}
          sub={`${rate}% of ${kes(billed)} billed`}
        />
        <Kpi
          label="Outstanding"
          icon={CircleAlert}
          iconTone="bad"
          value={kes(outstanding)}
          progress={billed ? (outstanding / (billed + outstanding)) * 100 : 0}
          sub="across all companies"
          tone="bad"
        />
        <Kpi
          label="Trucks live"
          icon={Truck}
          iconTone="sky"
          value={`${live}/${s.trucks.length}`}
          progress={s.trucks.length ? (live / s.trucks.length) * 100 : 0}
          altBar
          sub="sharing GPS"
        />
      </div>

      <div className="grid g3">
        <Panel title="City collection rate" icon={BarChart3}>
          <ColumnChart
            caption="Share of each month's billing collected across all companies"
            axis={(v) => `${v}%`}
            data={trend.map((r) => ({
              label: monthName(r.month),
              value: r.rate,
              display: `${r.rate}%`,
              note: `${kes(r.paid)} of ${kes(r.billed)}`,
            }))}
          />
        </Panel>
        <Panel title="Kept out of the dump site" icon={Recycle}>
          <p className="hint" style={{ marginTop: -8 }}>
            {impact.rate}% of {fmtKg(impact.total)} collected in the last 30 days was recyclable or organic.
          </p>
          <StackedColumns
            caption="Kilograms collected per week, diverted versus landfill"
            series={["Recyclable & organic", "Mixed & residual"]}
            format={fmtKg}
            data={weeklyDiversion(s, null, 8).map((w) => ({ label: w.label, parts: [w.diverted, w.landfill] }))}
          />
        </Panel>
        <Panel title={`Collection rate · ${mon}`} icon={Building2}>
          <BarList
            caption="This month's collection rate per company"
            data={COMPANIES.map((c) => {
              const b = monthSum(s, c.id, "charge");
              const p = monthSum(s, c.id, "payment");
              const rate = b ? Math.round((p / b) * 100) : 0;
              return { label: c.name, value: rate, display: `${rate}%`, note: `${kes(p)} of ${kes(b)}` };
            })}
          />
        </Panel>
      </div>

      <Panel title="Companies" icon={Building2}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Paybill</th>
                <th>Estates</th>
                <th className="r">Clients</th>
                <th className="r">Billed {mon}</th>
                <th className="r">Collected {mon}</th>
                <th className="r">Rate</th>
                <th className="r">Open tickets</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((c) => {
                const b = monthSum(s, c.id, "charge");
                const p = monthSum(s, c.id, "payment");
                const rate = b ? Math.round((p / b) * 100) : 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <CompanyTag companyId={c.id} />
                    </td>
                    <td className="mono">{c.paybill}</td>
                    <td>{c.estates.map(estateName).join(", ")}</td>
                    <td className="r">{s.clients.filter((x) => x.company === c.id).length}</td>
                    <td className="r">{group(b)}</td>
                    <td className="r">{group(p)}</td>
                    <td className="r">
                      <Chip tone={rate >= 70 ? "ok" : rate >= 50 ? "warn" : "bad"}>{rate}%</Chip>
                    </td>
                    <td className="r">{openTicketCount(s, (t) => t.company === c.id)}</td>
                    <td>
                      <button type="button" className="btn small" onClick={() => openCompany(c.id)}>
                        Open
                        <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
