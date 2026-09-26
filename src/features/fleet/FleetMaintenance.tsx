"use client";

import { CalendarClock, Plus, ShieldAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, Panel } from "@/components/ui/Panel";
import {
  paymentLabel,
  serviceDue,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
  workOrderCost,
  type FleetBundle,
  type WorkOrder,
} from "@/lib/fleet";
import { fmtDate, group, kes } from "@/lib/format";
import { ServiceChip } from "./FleetBits";
import type { WorkOrderDraft } from "./OfficeForms";

type Filter = "open" | "done" | "all";

const STATUS_TONE: Record<WorkOrder["status"], "ok" | "warn" | "bad" | "neutral"> = {
  open: "warn",
  in_progress: "neutral",
  done: "ok",
  cancelled: "neutral",
};

export function FleetMaintenance({
  data,
  onOrder,
  onNew,
}: {
  data: FleetBundle;
  onOrder: (order: WorkOrder) => void;
  onNew: (draft?: WorkOrderDraft) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const orders = data.workOrders.filter((w) =>
    filter === "all" ? true : filter === "open" ? w.status === "open" || w.status === "in_progress" : w.status === "done" || w.status === "cancelled",
  );
  const schedule = [...data.vehicles].sort((a, b) => {
    const da = serviceDue(a, data.today);
    const db = serviceDue(b, data.today);
    return Math.min(da.kmLeft / 50, da.daysLeft) - Math.min(db.kmLeft / 50, db.daysLeft);
  });
  const openCount = data.workOrders.filter((w) => w.status === "open" || w.status === "in_progress").length;

  return (
    <>
      <Panel title="Service schedule" icon={CalendarClock}>
        <p className="hint" style={{ marginTop: -4 }}>
          Each truck is serviced every so many km or days, whichever comes first. Soonest first.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Truck</th>
                <th>Last service</th>
                <th>Due at</th>
                <th>Left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {schedule.map((v) => {
                const due = serviceDue(v, data.today);
                const booked = data.workOrders.some((w) => w.truck === v.truck && w.kind === "service" && (w.status === "open" || w.status === "in_progress"));
                return (
                  <tr key={v.truck}>
                    <td className="mono">{v.truck}</td>
                    <td>
                      {fmtDate(v.lastServiceDate)} <span className="hint">· {group(v.lastServiceKm)} km</span>
                    </td>
                    <td>
                      {group(due.dueKm)} km <span className="hint">or {fmtDate(due.dueDate)}</span>
                    </td>
                    <td>
                      <ServiceChip vehicle={v} today={data.today} />
                    </td>
                    <td className="r">
                      {booked ? (
                        <Chip tone="neutral">Booked</Chip>
                      ) : (
                        <button
                          type="button"
                          className={`btn small ${due.status === "ok" ? "ghost" : ""}`}
                          onClick={() => onNew({ truck: v.truck, kind: "service", title: "Scheduled service: oil, filters, greasing" })}
                        >
                          Book service
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Work orders"
        icon={Wrench}
        aside={
          <div className="row" style={{ gap: 8 }}>
            <div className="segmented" role="radiogroup" aria-label="Show">
              {(
                [
                  ["open", `Open (${openCount})`],
                  ["done", "Closed"],
                  ["all", "All"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="btn small primary" onClick={() => onNew()}>
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              New
            </button>
          </div>
        }
      >
        {orders.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Truck</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Garage</th>
                  <th className="r">Cost</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((w) => (
                  <tr key={w.id} className="click" onClick={() => onOrder(w)}>
                    <td className="wrap">
                      <div className="t with-ico">
                        {w.kind === "defect" && w.status !== "done" && <ShieldAlert size={14} strokeWidth={2.2} className="warn-ico" aria-hidden="true" />}
                        {w.title}
                      </div>
                      <div className="hint">
                        <span className="mono">{w.id}</span> · {WORK_ORDER_KIND_LABEL[w.kind]}
                      </div>
                    </td>
                    <td className="mono">{w.truck}</td>
                    <td>
                      <Chip tone={STATUS_TONE[w.status]}>{WORK_ORDER_STATUS_LABEL[w.status]}</Chip>
                    </td>
                    <td>
                      {fmtDate(w.openedAt)}
                      <div className="hint">{w.openedBy}</div>
                    </td>
                    <td>{w.vendor || <span className="hint">—</span>}</td>
                    <td className="r num">
                      {workOrderCost(w) ? kes(workOrderCost(w)) : "—"}
                      {workOrderCost(w) > 0 && <div className="hint">{paymentLabel(w.paidFrom)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Wrench}>{filter === "open" ? "No open jobs. Defects from daily checks land here." : "No work orders yet."}</Empty>
        )}
      </Panel>
    </>
  );
}
