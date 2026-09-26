"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardCheck,
  ClipboardX,
  FileWarning,
  Fuel,
  Gauge,
  OctagonAlert,
  Route,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Empty } from "@/components/ui/Panel";
import {
  docStatus,
  serviceDue,
  VEHICLE_STATE_LABEL,
  type FleetAlert,
  type FleetAlertKind,
  type Vehicle,
} from "@/lib/fleet";
import { group } from "@/lib/format";

export function VehicleStateChip({ state }: { state: Vehicle["state"] }) {
  const tone = state === "active" ? "ok" : state === "workshop" ? "warn" : "bad";
  const icon = state === "active" ? CircleCheck : state === "workshop" ? Wrench : OctagonAlert;
  return (
    <Chip tone={tone} icon={icon}>
      {VEHICLE_STATE_LABEL[state]}
    </Chip>
  );
}

export function DocChip({ expiresOn, today }: { expiresOn: string; today: string }) {
  const { status, daysLeft } = docStatus(expiresOn, today);
  if (status === "expired")
    return (
      <Chip tone="bad" icon={FileWarning}>
        Expired {-daysLeft}d ago
      </Chip>
    );
  if (status === "expiring")
    return (
      <Chip tone="warn" icon={FileWarning}>
        {daysLeft === 0 ? "Expires today" : `${daysLeft}d left`}
      </Chip>
    );
  return (
    <Chip tone="ok" icon={CircleCheck}>
      Valid
    </Chip>
  );
}

export function ServiceChip({ vehicle, today }: { vehicle: Vehicle; today: string }) {
  const due = serviceDue(vehicle, today);
  const text =
    due.status === "overdue"
      ? due.kmLeft < 0
        ? `${group(-due.kmLeft)} km over`
        : `${-due.daysLeft}d overdue`
      : `${group(Math.max(0, due.kmLeft))} km · ${due.daysLeft}d`;
  return (
    <Chip tone={due.status === "overdue" ? "bad" : due.status === "soon" ? "warn" : "neutral"} icon={Wrench}>
      {text}
    </Chip>
  );
}

export function CheckChip({ check }: { check?: { at: string; result: "pass" | "defects"; defects: string[] } }) {
  if (!check)
    return (
      <Chip tone="neutral" icon={ClipboardX}>
        Not done
      </Chip>
    );
  return check.result === "pass" ? (
    <Chip tone="ok" icon={ClipboardCheck}>
      Passed {check.at.slice(11)}
    </Chip>
  ) : (
    <Chip tone="warn" icon={CircleAlert}>
      {check.defects.length} defect{check.defects.length === 1 ? "" : "s"}
    </Chip>
  );
}

/** A 0–100 driver score with a coloured rail. */
export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 85 ? "ok" : score >= 70 ? "warn" : "bad";
  return (
    <span className={`score ${tone}`}>
      <b className="num">{score}</b>
      <span className="score-rail" aria-hidden="true">
        <i style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

const ALERT_ICONS: Record<FleetAlertKind, LucideIcon> = {
  document: FileWarning,
  service: Wrench,
  defect: ShieldAlert,
  fuel: Fuel,
  driving: Gauge,
  check: ClipboardX,
};

/** The fleet's to-do list; each alert can jump to where it's dealt with. */
export function AlertList({ alerts, onOpen, limit }: { alerts: FleetAlert[]; onOpen?: (a: FleetAlert) => void; limit?: number }) {
  if (!alerts.length) return <Empty icon={CircleCheck}>Nothing needs attention. Papers, services and checks are all in order.</Empty>;
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <div className="list fleet-alerts">
      {shown.map((a) => {
        const Icon = ALERT_ICONS[a.kind] ?? CircleDot;
        const body = (
          <>
            <span className={`itile sm ${a.severity === "bad" ? "bad" : "warn"}`} aria-hidden="true">
              <Icon size={15} strokeWidth={2} />
            </span>
            <span className="fleet-alert-text">
              <span className="t">{a.title}</span>
              <span className="sub">{a.body}</span>
            </span>
          </>
        );
        return onOpen ? (
          <button key={a.id} type="button" className="li fleet-alert" onClick={() => onOpen(a)}>
            {body}
            <Route size={15} strokeWidth={2} className="fleet-alert-go" aria-hidden="true" />
          </button>
        ) : (
          <div key={a.id} className="li fleet-alert">
            {body}
          </div>
        );
      })}
      {limit && alerts.length > limit && <p className="hint">+{alerts.length - limit} more</p>}
    </div>
  );
}
