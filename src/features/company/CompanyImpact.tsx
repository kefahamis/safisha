"use client";

import { Leaf, Recycle, Scale, Truck } from "lucide-react";
import { StackedColumns } from "@/components/charts/Charts";
import { Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { fmtKg, impactTotals, weeklyDiversion } from "@/lib/analytics";
import { companyById } from "@/lib/reference/companies";
import { ESTATES, estateName } from "@/lib/reference/estates";
import { clientsOf } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

/**
 * How much the company collected and how much stayed out of the dump site,
 * from the weights crews record at each stop.
 */
export function CompanyImpact() {
  const s = useAppState();
  const co = companyById(s.companyId);
  const clients = clientsOf(s, co.id);
  const ids = new Set(clients.map((c) => c.id));
  const month = impactTotals(s, ids, 30);
  const quarter = impactTotals(s, ids, 90);
  const weeks = weeklyDiversion(s, ids, 8);

  const byEstate = co.estates.map((code) => {
    const estIds = new Set(clients.filter((c) => c.estate === code).map((c) => c.id));
    return { code, ...impactTotals(s, estIds, 30) };
  });

  return (
    <>
      <PageHead title="Recycling" icon={Recycle}>
        Weights recorded by crews at each stop. Recyclable and organic waste counts as kept out of the dump site.
      </PageHead>

      <div className="kpis">
        <Kpi label="Collected · 30 days" icon={Scale} value={fmtKg(month.total)} sub={`${month.pickups} weighed pickups`} />
        <Kpi
          label="Kept out of the dump site"
          icon={Leaf}
          iconTone="ok"
          value={fmtKg(month.diverted)}
          progress={month.rate}
          sub={`${month.rate}% diversion rate`}
        />
        <Kpi label="Collected · 90 days" icon={Truck} iconTone="sky" value={fmtKg(quarter.total)} sub={`${quarter.rate}% diverted`} />
      </div>

      <div className="grid g-main">
        <Panel title="Weekly tonnage" icon={Recycle}>
          <StackedColumns
            caption="Kilograms collected per week, diverted versus landfill"
            series={["Recyclable & organic", "Mixed & residual"]}
            format={fmtKg}
            height={220}
            data={weeks.map((w) => ({ label: w.label, parts: [w.diverted, w.landfill] }))}
          />
        </Panel>
        <Panel title="By estate · 30 days" icon={Leaf}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Estate</th>
                  <th className="r">Collected</th>
                  <th className="r">Diverted</th>
                </tr>
              </thead>
              <tbody>
                {byEstate.map((e) => (
                  <tr key={e.code}>
                    <td>{estateName(e.code)}</td>
                    <td className="r">{fmtKg(e.total)}</td>
                    <td className="r">{e.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Estates served: {co.estates.map((c) => ESTATES[c]?.name).join(", ")}.
          </p>
        </Panel>
      </div>
    </>
  );
}
