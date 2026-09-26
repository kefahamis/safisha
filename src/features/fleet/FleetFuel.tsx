"use client";

import { Droplets, Fuel, Gauge, Plus, TriangleAlert } from "lucide-react";
import { Kpi, Panel } from "@/components/ui/Panel";
import { fuelEfficiency, paymentLabel, type FleetBundle, type FuelEfficiency } from "@/lib/fleet";
import { fmtDate, group, kes } from "@/lib/format";
import { lastMonth } from "./FleetOverview";

const FLAG_TEXT = {
  low_efficiency: "Low km/L",
  over_tank: "More than the tank",
} as const;

export function FleetFuel({ data, onLog }: { data: FleetBundle; onLog: () => void }) {
  const m = lastMonth(data);
  const byTruck = new Map<string, FuelEfficiency[]>();
  for (const v of data.vehicles) {
    byTruck.set(v.truck, fuelEfficiency(data.fuel.filter((f) => f.truck === v.truck), v, data.settings.fuelAlertPct));
  }
  const all = [...byTruck.values()].flat().sort((a, b) => b.log.at.localeCompare(a.log.at));
  const flagged = all.filter((f) => f.flag && f.log.at.slice(0, 10) >= m.period.from);

  return (
    <>
      <div className="kpis">
        <Kpi label="Fuel spend · 30 days" value={kes(m.fuelCost)} sub={`${group(m.fuelL)} litres`} icon={Fuel} iconTone="warn" />
        <Kpi label="Fleet average" value={m.kmPerL ? `${m.kmPerL.toFixed(2)} km/L` : "—"} sub={`${group(m.km)} km by GPS`} icon={Gauge} iconTone="sky" />
        <Kpi
          label="Fuel per km"
          value={m.km ? `KES ${(m.fuelCost / m.km).toFixed(1)}` : "—"}
          sub="Spend over GPS distance"
          icon={Droplets}
          iconTone="violet"
        />
        <Kpi
          label="Flagged fills · 30 days"
          value={String(flagged.length)}
          sub={`More than ${data.settings.fuelAlertPct}% under expected km/L`}
          icon={TriangleAlert}
          iconTone={flagged.length ? "bad" : "ok"}
        />
      </div>

      <Panel title="Efficiency by truck" icon={Gauge}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Truck</th>
                <th className="r">Expected</th>
                <th className="r">Last 30 days</th>
                <th className="r">Last fill</th>
                <th className="r">Litres</th>
                <th className="r">Spend</th>
                <th className="r">Fuel / km</th>
              </tr>
            </thead>
            <tbody>
              {data.vehicles.map((v) => {
                const c = m.costs.find((x) => x.truck === v.truck)!;
                const fills = byTruck.get(v.truck) ?? [];
                const last = fills[fills.length - 1];
                const low = c.kmPerL !== undefined && c.kmPerL < v.expectedKmPerL * (1 - data.settings.fuelAlertPct / 100);
                return (
                  <tr key={v.truck}>
                    <td className="mono">{v.truck}</td>
                    <td className="r num">{v.expectedKmPerL} km/L</td>
                    <td className="r num">{c.kmPerL ? <span className={low ? "bad-text" : ""}>{c.kmPerL.toFixed(2)} km/L</span> : "—"}</td>
                    <td className="r num">
                      {last?.kmPerL ? <span className={last.flag ? "chip warn num" : ""}>{last.kmPerL.toFixed(2)}</span> : "—"}
                    </td>
                    <td className="r num">{group(c.fuelL)}</td>
                    <td className="r num">{kes(c.fuelCost)}</td>
                    <td className="r num">{c.km ? `KES ${(c.fuelCost / c.km).toFixed(1)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Efficiency is worked out fill to fill: km since the previous fill over the litres put back in. GPS km is for the
          month; the odometer readings drivers type decide each fill.
        </p>
      </Panel>

      <Panel
        title="Fill log"
        icon={Fuel}
        aside={
          <button type="button" className="btn small primary" onClick={onLog}>
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            Log fuel
          </button>
        }
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Truck</th>
                <th>Station</th>
                <th className="r">Litres</th>
                <th className="r">Amount</th>
                <th className="r">Odometer</th>
                <th className="r">km/L</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {all.slice(0, 60).map((f) => (
                <tr key={f.log.id} className={f.flag ? "flagged" : undefined}>
                  <td>
                    {fmtDate(f.log.at)}
                    <div className="hint">{f.log.driver}</div>
                  </td>
                  <td className="mono">{f.log.truck}</td>
                  <td>{f.log.station || <span className="hint">—</span>}</td>
                  <td className="r num">{f.log.litres}</td>
                  <td className="r num">{kes(f.log.amount)}</td>
                  <td className="r num">{group(f.log.odometerKm)}</td>
                  <td className="r num">
                    {f.kmPerL ? f.kmPerL.toFixed(2) : <span className="hint">—</span>}
                    {f.flag && <div className="chip warn">{FLAG_TEXT[f.flag]}</div>}
                  </td>
                  <td>
                    {paymentLabel(f.log.paidFrom)}
                    {f.log.reference && <div className="hint mono">{f.log.reference}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
