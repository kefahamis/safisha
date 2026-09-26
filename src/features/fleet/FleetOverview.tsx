"use client";

import { Activity, ClipboardCheck, Coins, Fuel, Leaf, Route, Scale, Truck } from "lucide-react";
import { Kpi, Panel } from "@/components/ui/Panel";
import { addDays, currentDocuments, docStatus, vehicleCosts, workingDays, type FleetAlert, type FleetBundle } from "@/lib/fleet";
import { group, kes } from "@/lib/format";
import { useAppState } from "@/store/StoreProvider";
import { AlertList, CheckChip, ServiceChip, VehicleStateChip } from "./FleetBits";

export type FleetTab = "overview" | "vehicles" | "maintenance" | "fuel" | "trips" | "drivers" | "compliance";

/** Where each kind of alert is dealt with. */
export const ALERT_TAB: Record<FleetAlert["kind"], FleetTab> = {
  document: "compliance",
  service: "maintenance",
  defect: "maintenance",
  fuel: "fuel",
  driving: "drivers",
  check: "vehicles",
};

/** Totals over the last 30 days, per vehicle and for the fleet. */
export function lastMonth(data: FleetBundle) {
  const period = { from: addDays(data.today, -29), to: data.today };
  const costs = data.vehicles.map((v) => vehicleCosts(v, period, data));
  const sum = (f: (c: (typeof costs)[number]) => number) => costs.reduce((s, c) => s + f(c), 0);
  const km = sum((c) => c.km);
  const fuelL = sum((c) => c.fuelL);
  const fuelCost = sum((c) => c.fuelCost);
  const maintenance = sum((c) => c.maintenanceCost);
  const compliance = sum((c) => c.complianceCost);
  const tonnes = Object.values(data.tonnesByTruck).reduce((s, x) => s + x, 0);
  const co2 = sum((c) => c.co2Kg);
  const activeDays = sum((c) => c.activeDays);
  return {
    period,
    costs,
    km,
    fuelL,
    fuelCost,
    maintenance,
    compliance,
    tonnes,
    co2,
    kmPerL: fuelL ? km / fuelL : undefined,
    costPerKm: km ? (fuelCost + maintenance) / km : undefined,
    costPerTonne: tonnes ? (fuelCost + maintenance + compliance) / tonnes : undefined,
    utilisation: data.vehicles.length ? activeDays / (data.vehicles.length * workingDays(period.from, period.to)) : 0,
  };
}

export function FleetOverview({ data, onTab, onVehicle }: { data: FleetBundle; onTab: (tab: FleetTab) => void; onVehicle: (truck: string) => void }) {
  const s = useAppState();
  const m = lastMonth(data);
  const inService = data.vehicles.filter((v) => v.state === "active");
  const checked = inService.filter((v) => s.fleet.checks[v.truck]).length;
  const docs = currentDocuments(data.documents);
  const papersFor = (truck: string) =>
    docs.filter((d) => d.subjectType === "vehicle" && d.subject === truck && docStatus(d.expiresOn, data.today).status !== "valid").length;

  return (
    <>
      <div className="kpis">
        <Kpi
          label="In service"
          value={`${inService.length} of ${data.vehicles.length}`}
          sub={`${data.vehicles.filter((v) => v.state === "workshop").length} in workshop · ${data.vehicles.filter((v) => v.state === "off_road").length} off road`}
          progress={data.vehicles.length ? (inService.length / data.vehicles.length) * 100 : 0}
          icon={Truck}
        />
        <Kpi
          label="Checks today"
          value={`${checked} of ${inService.length}`}
          sub="Start-of-day walk-rounds"
          progress={inService.length ? (checked / inService.length) * 100 : 0}
          icon={ClipboardCheck}
          iconTone="ok"
        />
        <Kpi
          label="Utilisation · 30 days"
          value={`${Math.round(m.utilisation * 100)}%`}
          sub={`${group(m.km)} km driven`}
          progress={m.utilisation * 100}
          icon={Activity}
          iconTone="sky"
        />
        <Kpi
          label="Fuel · 30 days"
          value={kes(m.fuelCost)}
          sub={`${group(m.fuelL)} L${m.kmPerL ? ` · ${m.kmPerL.toFixed(1)} km/L` : ""}`}
          icon={Fuel}
          iconTone="warn"
        />
        <Kpi
          label="Running cost per km"
          value={m.costPerKm ? `KES ${m.costPerKm.toFixed(0)}` : "—"}
          sub={`Fuel + maintenance ${kes(m.fuelCost + m.maintenance)}`}
          icon={Coins}
          iconTone="violet"
        />
        <Kpi
          label="Cost per tonne collected"
          value={m.costPerTonne ? kes(m.costPerTonne) : "—"}
          sub={`${m.tonnes.toFixed(1)} t weighed at stops`}
          icon={Scale}
          iconTone="accent"
        />
        <Kpi
          label="CO₂ · 30 days"
          value={`${(m.co2 / 1000).toFixed(1)} t`}
          sub={m.tonnes ? `${Math.round(m.co2 / m.tonnes)} kg per tonne collected` : "From fuel burned"}
          icon={Leaf}
          iconTone="ok"
        />
      </div>

      <Panel
        title="Needs attention"
        icon={Route}
        aside={data.alerts.length ? <span className="chip warn">{data.alerts.length}</span> : undefined}
      >
        <AlertList alerts={data.alerts} onOpen={(a) => onTab(ALERT_TAB[a.kind])} limit={8} />
      </Panel>

      <Panel title="Vehicles" icon={Truck}>
        <div className="tablewrap">
          <table className="fleet-table">
            <thead>
              <tr>
                <th>Truck</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Today&rsquo;s check</th>
                <th>Next service</th>
                <th className="r">Odometer</th>
                <th className="r">Papers</th>
              </tr>
            </thead>
            <tbody>
              {data.vehicles.map((v) => {
                const bad = papersFor(v.truck);
                return (
                  <tr key={v.truck} className="click" onClick={() => onVehicle(v.truck)}>
                    <td>
                      <div className="mono t">{v.truck}</div>
                      <div className="hint">
                        {v.make} {v.model}
                      </div>
                    </td>
                    <td>{v.driver}</td>
                    <td>
                      <VehicleStateChip state={v.state} />
                    </td>
                    <td>{v.state === "active" ? <CheckChip check={s.fleet.checks[v.truck]} /> : <span className="hint">—</span>}</td>
                    <td>
                      <ServiceChip vehicle={v} today={data.today} />
                    </td>
                    <td className="r num">{group(v.odometerKm)} km</td>
                    <td className="r">{bad ? <span className="chip warn">{bad} to renew</span> : <span className="chip ok">In order</span>}</td>
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
