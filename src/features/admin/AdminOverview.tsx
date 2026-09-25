"use client";

import { useRouter } from "next/navigation";
import { Chip, CompanyTag } from "@/components/ui/Chip";
import { Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { group, kes } from "@/lib/format";
import { COMPANIES } from "@/lib/reference/companies";
import { ESTATES, estateName } from "@/lib/reference/estates";
import { monthSum, openTicketCount, outstandingFor } from "@/lib/selectors";
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
  const paidLastMonth = COMPANIES.reduce((a, c) => a + monthSum(s, c.id, "payment", "2026-08"), 0);
  const delta = paidLastMonth ? Math.round(((paid - paidLastMonth) / paidLastMonth) * 100) : 0;

  const openCompany = (id: string) => {
    actions.selectCompany(id);
    router.push("/company");
  };

  return (
    <>
      <PageHead title="City overview">
        All licensed collection companies on the platform · September 2026.
      </PageHead>

      <div className="kpis">
        <Kpi
          label="Companies"
          value={COMPANIES.length}
          sub={`${Object.keys(ESTATES).length} estates covered`}
        />
        <Kpi label="Clients" value={s.clients.length} sub="unique numbers issued" />
        <Kpi
          label="Collected · Sep"
          value={kes(paid)}
          progress={rate}
          trend={{ dir: delta >= 0 ? "up" : "down", label: `${Math.abs(delta)}%` }}
          sub={`${rate}% of ${kes(billed)} billed`}
        />
        <Kpi
          label="Outstanding"
          value={kes(outstanding)}
          progress={billed ? (outstanding / (billed + outstanding)) * 100 : 0}
          sub="across all companies"
          tone="bad"
        />
        <Kpi
          label="Trucks live"
          value={`${live}/${s.trucks.length}`}
          progress={s.trucks.length ? (live / s.trucks.length) * 100 : 0}
          altBar
          sub="sharing GPS"
        />
      </div>

      <Panel title="Companies">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Paybill</th>
                <th>Estates</th>
                <th className="r">Clients</th>
                <th className="r">Billed Sep</th>
                <th className="r">Collected Sep</th>
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
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => openCompany(c.id)}
                      >
                        Open
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
