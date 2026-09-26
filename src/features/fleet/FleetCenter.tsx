"use client";

import {
  CalendarClock,
  FileBadge,
  Fuel,
  Gauge,
  LayoutDashboard,
  Medal,
  Plus,
  RefreshCw,
  Route,
  SlidersHorizontal,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Empty, PageHead } from "@/components/ui/Panel";
import { useTabStrip } from "@/components/ui/useTabStrip";
import type { WorkOrder } from "@/lib/fleet";
import { companyById } from "@/lib/reference/companies";
import { useAppState } from "@/store/StoreProvider";
import { FleetCompliance } from "./FleetCompliance";
import { FleetDrivers } from "./FleetDrivers";
import { CheckForm, FuelForm } from "./FleetForms";
import { FleetFuel } from "./FleetFuel";
import { FleetMaintenance } from "./FleetMaintenance";
import { FleetOverview, type FleetTab } from "./FleetOverview";
import { FleetTrips } from "./FleetTrips";
import { FleetVehicles, VehicleSheet } from "./FleetVehicles";
import { DocumentForm, RulesForm, VehicleForm, WorkOrderForm, type DocumentDraft, type WorkOrderDraft } from "./OfficeForms";
import { useFleet } from "./useFleet";

const TABS: { id: FleetTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "vehicles", label: "Vehicles", icon: Truck },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "fuel", label: "Fuel", icon: Fuel },
  { id: "trips", label: "Trips", icon: Route },
  { id: "drivers", label: "Drivers", icon: Medal },
  { id: "compliance", label: "Compliance", icon: FileBadge },
];

type Sheet =
  | { kind: "vehicle"; truck: string }
  | { kind: "editVehicle"; truck: string }
  | { kind: "workOrder"; order?: WorkOrder; draft?: WorkOrderDraft }
  | { kind: "document"; draft?: DocumentDraft }
  | { kind: "fuel" }
  | { kind: "check"; truck: string }
  | { kind: "rules" };

export function FleetCenter() {
  const s = useAppState();
  const company = s.companyId;
  const { data, error, load, run } = useFleet(company);
  const [tab, setTab] = useState<FleetTab>("overview");
  const tabStrip = useTabStrip<HTMLDivElement>(tab);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = () => setSheet(null);
  const vehicle = (truck: string) => data?.vehicles.find((v) => v.truck === truck);

  return (
    <>
      <PageHead
        title="Fleet management"
        icon={Gauge}
        actions={
          data?.canManage ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => setSheet({ kind: "fuel" })}>
                <Fuel size={16} strokeWidth={2.2} aria-hidden="true" />
                Log fuel
              </button>
              <button type="button" className="btn primary" onClick={() => setSheet({ kind: "workOrder" })}>
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                Work order
              </button>
              <button type="button" className="btn ghost" onClick={() => setSheet({ kind: "rules" })}>
                <SlidersHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
                Fleet rules
              </button>
            </div>
          ) : undefined
        }
      >
        {companyById(company).name}&rsquo;s trucks: daily checks, workshop, fuel, papers, drivers and trips. Costs post to the books
        by themselves.
      </PageHead>

      <div className="tabs" role="tablist" aria-label="Fleet sections" ref={tabStrip}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className="tab" onClick={() => setTab(x.id)}>
            <x.icon size={15} strokeWidth={2.2} aria-hidden="true" />
            {x.label}
          </button>
        ))}
        <button type="button" className="btn small ghost icon-only" onClick={() => void load()} aria-label="Reload" title="Reload">
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {error && <div className="banner">{error}</div>}
      {!data && !error && <Empty icon={CalendarClock}>Loading the fleet…</Empty>}

      {data && (
        <>
          {tab === "overview" && <FleetOverview data={data} onTab={setTab} onVehicle={(truck) => setSheet({ kind: "vehicle", truck })} />}
          {tab === "vehicles" && <FleetVehicles data={data} onOpen={(truck) => setSheet({ kind: "vehicle", truck })} />}
          {tab === "maintenance" && (
            <FleetMaintenance
              data={data}
              onOrder={(order) => setSheet({ kind: "workOrder", order })}
              onNew={(draft) => setSheet({ kind: "workOrder", draft })}
            />
          )}
          {tab === "fuel" && <FleetFuel data={data} onLog={() => setSheet({ kind: "fuel" })} />}
          {tab === "trips" && <FleetTrips data={data} />}
          {tab === "drivers" && <FleetDrivers data={data} run={run} />}
          {tab === "compliance" && <FleetCompliance data={data} run={run} onDocument={(draft) => setSheet({ kind: "document", draft })} />}

          {sheet?.kind === "vehicle" && vehicle(sheet.truck) && (
            <VehicleSheet
              data={data}
              vehicle={vehicle(sheet.truck)!}
              onClose={close}
              onEdit={() => setSheet({ kind: "editVehicle", truck: sheet.truck })}
              onWorkOrder={(draft) => setSheet({ kind: "workOrder", draft })}
              onDocument={(draft) => setSheet({ kind: "document", draft })}
              onCheck={() => setSheet({ kind: "check", truck: sheet.truck })}
            />
          )}
          {sheet?.kind === "editVehicle" && vehicle(sheet.truck) && <VehicleForm vehicle={vehicle(sheet.truck)!} run={run} onClose={close} />}
          {sheet?.kind === "workOrder" && (
            <WorkOrderForm order={sheet.order} draft={sheet.draft} vehicles={data.vehicles} run={run} onClose={close} />
          )}
          {sheet?.kind === "document" && (
            <DocumentForm
              draft={sheet.draft}
              today={data.today}
              subjects={[
                ...data.vehicles.map((v) => ({ type: "vehicle" as const, id: v.truck, name: v.truck })),
                ...data.drivers.map((d) => ({ type: "driver" as const, id: d.id, name: d.name })),
              ]}
              run={run}
              onClose={close}
            />
          )}
          {sheet?.kind === "fuel" && data.vehicles[0] && (
            <FuelForm
              truck={data.vehicles[0].truck}
              trucks={data.vehicles.map((v) => ({ id: v.truck, odometer: lastReading(data, v.truck) }))}
              lastOdometer={lastReading(data, data.vehicles[0].truck)}
              onClose={close}
              onDone={(res) => {
                close();
                void run(Promise.resolve(res));
              }}
            />
          )}
          {sheet?.kind === "check" && (
            <CheckForm
              truck={sheet.truck}
              lastOdometer={lastReading(data, sheet.truck)}
              onClose={close}
              onDone={(res) => {
                close();
                void run(Promise.resolve(res));
              }}
            />
          )}
          {sheet?.kind === "rules" && <RulesForm company={company} settings={data.settings} run={run} onClose={close} />}
        </>
      )}
    </>
  );
}

/** The last odometer reading someone typed in: the floor for the next one. */
export function lastReading(data: { inspections: { truck: string; odometerKm: number }[]; fuel: { truck: string; odometerKm: number }[] }, truck: string) {
  return Math.max(
    0,
    ...data.inspections.filter((i) => i.truck === truck).map((i) => i.odometerKm),
    ...data.fuel.filter((f) => f.truck === truck).map((f) => f.odometerKm),
  );
}
