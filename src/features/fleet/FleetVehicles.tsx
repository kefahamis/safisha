"use client";

import { ClipboardCheck, FileBadge, Pencil, Plus, Truck, Wrench, X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import {
  CO2_KG_PER_L,
  currentDocuments,
  DOC_KINDS,
  fuelEfficiency,
  serviceDue,
  WORK_ORDER_STATUS_LABEL,
  workOrderCost,
  type FleetBundle,
  type Vehicle,
} from "@/lib/fleet";
import { fmtDate, group, kes } from "@/lib/format";
import { useAppState } from "@/store/StoreProvider";
import { CheckChip, DocChip, ServiceChip, VehicleStateChip } from "./FleetBits";
import { lastMonth } from "./FleetOverview";
import type { DocumentDraft, WorkOrderDraft } from "./OfficeForms";

export function FleetVehicles({ data, onOpen }: { data: FleetBundle; onOpen: (truck: string) => void }) {
  const s = useAppState();
  const m = lastMonth(data);
  return (
    <div className="fleet-cards">
      {data.vehicles.map((v) => {
        const c = m.costs.find((x) => x.truck === v.truck)!;
        return (
          <button key={v.truck} type="button" className="panel fleet-card" onClick={() => onOpen(v.truck)}>
            <div className="row between">
              <span className="plate">{v.truck}</span>
              <VehicleStateChip state={v.state} />
            </div>
            <div className="fleet-card-model">
              {v.make} {v.model} · {v.year}
            </div>
            <div className="hint">
              {v.driver} · {(v.capacityKg / 1000).toFixed(1)} t payload
            </div>
            <dl className="fleet-facts">
              <div>
                <dt>Odometer</dt>
                <dd className="num">{group(v.odometerKm)} km</dd>
              </div>
              <div>
                <dt>30-day km</dt>
                <dd className="num">{group(c.km)}</dd>
              </div>
              <div>
                <dt>km/L</dt>
                <dd className="num">{c.kmPerL ? c.kmPerL.toFixed(1) : "—"}</dd>
              </div>
              <div>
                <dt>Cost/km</dt>
                <dd className="num">{c.costPerKm ? `KES ${c.costPerKm.toFixed(0)}` : "—"}</dd>
              </div>
            </dl>
            <div className="row" style={{ gap: 6 }}>
              <ServiceChip vehicle={v} today={data.today} />
              {v.state === "active" && <CheckChip check={s.fleet.checks[v.truck]} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Everything about one truck, with the actions a fleet office takes on it. */
export function VehicleSheet({
  data,
  vehicle,
  onClose,
  onEdit,
  onWorkOrder,
  onDocument,
  onCheck,
}: {
  data: FleetBundle;
  vehicle: Vehicle;
  onClose: () => void;
  onEdit: () => void;
  onWorkOrder: (draft: WorkOrderDraft) => void;
  onDocument: (draft: DocumentDraft) => void;
  onCheck: () => void;
}) {
  const v = vehicle;
  const m = lastMonth(data);
  const c = m.costs.find((x) => x.truck === v.truck)!;
  const due = serviceDue(v, data.today);
  const docs = currentDocuments(data.documents).filter((d) => d.subjectType === "vehicle" && d.subject === v.truck);
  const orders = data.workOrders.filter((w) => w.truck === v.truck).slice(0, 6);
  const fills = fuelEfficiency(data.fuel.filter((f) => f.truck === v.truck), v, data.settings.fuelAlertPct).reverse().slice(0, 5);
  const checks = data.inspections.filter((i) => i.truck === v.truck).slice(0, 5);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet fleet-sheet wide" role="dialog" aria-modal="true" aria-label={`Truck ${v.truck}`}>
        <div className="row between fleet-sheet-head">
          <h2 className="with-ico">
            <Truck size={19} strokeWidth={2.2} aria-hidden="true" />
            <span className="mono">{v.truck}</span>
            <VehicleStateChip state={v.state} />
          </h2>
          <button type="button" className="btn small ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <p className="hint">
          {v.make} {v.model} · {v.year} · {(v.capacityKg / 1000).toFixed(1)} t payload · {v.tankL} L {v.fuel} · driven by {v.driver}
        </p>
        <div className="row" style={{ margin: "12px 0 4px", gap: 8 }}>
          <button type="button" className="btn small" onClick={onEdit}>
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
            Edit details
          </button>
          <button type="button" className="btn small" onClick={() => onWorkOrder({ truck: v.truck, kind: "service", title: "Scheduled service: oil, filters, greasing" })}>
            <Wrench size={14} strokeWidth={2.2} aria-hidden="true" />
            Book service
          </button>
          <button type="button" className="btn small" onClick={() => onWorkOrder({ truck: v.truck, kind: "repair" })}>
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            Repair
          </button>
          <button type="button" className="btn small" onClick={onCheck}>
            <ClipboardCheck size={14} strokeWidth={2.2} aria-hidden="true" />
            Record a check
          </button>
        </div>

        <dl className="fleet-facts wide">
          <div>
            <dt>Odometer</dt>
            <dd className="num">{group(v.odometerKm)} km</dd>
          </div>
          <div>
            <dt>Next service</dt>
            <dd>
              {group(due.dueKm)} km or {fmtDate(due.dueDate)}
            </dd>
          </div>
          <div>
            <dt>30 days</dt>
            <dd className="num">
              {group(c.km)} km · {c.activeDays} days out
            </dd>
          </div>
          <div>
            <dt>Fuel · 30 days</dt>
            <dd className="num">
              {kes(c.fuelCost)} · {c.kmPerL ? `${c.kmPerL.toFixed(1)} km/L` : "—"} <span className="hint">(expect {v.expectedKmPerL})</span>
            </dd>
          </div>
          <div>
            <dt>Workshop · 30 days</dt>
            <dd className="num">{kes(c.maintenanceCost)}</dd>
          </div>
          <div>
            <dt>Cost per tonne</dt>
            <dd className="num">
              {c.costPerTonne ? kes(c.costPerTonne) : "—"} <span className="hint">({c.tonnes} t)</span>
            </dd>
          </div>
          <div>
            <dt>CO₂ · 30 days</dt>
            <dd className="num">
              {group(c.co2Kg)} kg <span className="hint">({CO2_KG_PER_L[v.fuel]} kg/L)</span>
            </dd>
          </div>
        </dl>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <Panel title="Papers" icon={FileBadge}>
            <div className="list">
              {DOC_KINDS.filter((k) => k.subject === "vehicle").map((k) => {
                const d = docs.find((x) => x.kind === k.key);
                return (
                  <div className="li" key={k.key}>
                    <div>
                      <div className="t">{k.label}</div>
                      <div className="sub">{d ? `${d.number || "No number"} · to ${fmtDate(d.expiresOn)}` : "Nothing on file"}</div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {d ? <DocChip expiresOn={d.expiresOn} today={data.today} /> : <Chip tone="bad">Missing</Chip>}
                      <button type="button" className="btn small ghost" onClick={() => onDocument({ subjectType: "vehicle", subject: v.truck, kind: k.key })}>
                        {d ? "Renew" : "Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Workshop history" icon={Wrench}>
            {orders.length ? (
              <div className="list">
                {orders.map((w) => (
                  <div className="li" key={w.id}>
                    <div>
                      <div className="t">{w.title}</div>
                      <div className="sub">
                        <span className="mono">{w.id}</span> · {fmtDate(w.closedAt ?? w.openedAt)}
                        {w.vendor ? ` · ${w.vendor}` : ""}
                      </div>
                    </div>
                    <div className="r">
                      <div className="num">{workOrderCost(w) ? kes(workOrderCost(w)) : "—"}</div>
                      <div className="hint">{WORK_ORDER_STATUS_LABEL[w.status]}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No workshop jobs yet.</p>
            )}
          </Panel>

          <Panel title="Recent fills">
            {fills.length ? (
              <div className="list">
                {fills.map((f) => (
                  <div className="li" key={f.log.id}>
                    <div>
                      <div className="t num">
                        {f.log.litres} L · {kes(f.log.amount)}
                      </div>
                      <div className="sub">
                        {fmtDate(f.log.at)} · {f.log.station || "—"}
                      </div>
                    </div>
                    <div className="r">
                      {f.kmPerL ? <span className={`chip ${f.flag ? "warn" : "neutral"} num`}>{f.kmPerL.toFixed(1)} km/L</span> : <span className="hint">first fill</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No fuel logged yet.</p>
            )}
          </Panel>

          <Panel title="Daily checks">
            {checks.length ? (
              <div className="list">
                {checks.map((i) => (
                  <div className="li" key={i.id}>
                    <div>
                      <div className="t">{fmtDate(i.at)}</div>
                      <div className="sub">
                        {i.driver} · {group(i.odometerKm)} km{i.notes ? ` · “${i.notes}”` : ""}
                      </div>
                    </div>
                    <CheckChip check={{ at: i.at, result: i.result, defects: Object.values(i.items).filter((x) => x === "defect") as string[] }} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No checks in the last 45 days.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
