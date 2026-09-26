"use client";

import { Check, FileBadge, LoaderCircle, SlidersHorizontal, Truck, Wrench } from "lucide-react";
import { useState } from "react";
import type { CommandResult, VehiclePatch } from "@/lib/commands";
import {
  DOC_KINDS,
  PAYMENT_ACCOUNTS,
  VEHICLE_STATE_LABEL,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
  type DocSubject,
  type FleetSettings,
  type Vehicle,
  type WorkOrder,
  type WorkOrderKind,
  type WorkOrderStatus,
} from "@/lib/fleet";
import { group } from "@/lib/format";
import { useActions } from "@/store/StoreProvider";
import { addDays } from "@/lib/fleet";
import { FormSheet } from "./FleetForms";

type Run = (pending: Promise<CommandResult>, done?: () => void) => Promise<CommandResult>;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")));

function Footer({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
  return (
    <>
      <button type="button" className="btn ghost" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" /> : <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
        {label}
      </button>
    </>
  );
}

/* ---------------- work orders ---------------- */

export interface WorkOrderDraft {
  truck: string;
  kind?: WorkOrderKind;
  title?: string;
}

/** Open a job, move it through the workshop, and close it with the bill. */
export function WorkOrderForm({
  order,
  draft,
  vehicles,
  run,
  onClose,
}: {
  order?: WorkOrder;
  draft?: WorkOrderDraft;
  vehicles: Vehicle[];
  run: Run;
  onClose: () => void;
}) {
  const actions = useActions();
  const [truck, setTruck] = useState(order?.truck ?? draft?.truck ?? vehicles[0]?.truck ?? "");
  const [kind, setKind] = useState<WorkOrderKind>(order?.kind ?? draft?.kind ?? "repair");
  const [title, setTitle] = useState(order?.title ?? draft?.title ?? "");
  const [detail, setDetail] = useState(order?.detail ?? "");
  const [status, setStatus] = useState<WorkOrderStatus>(order?.status ?? "open");
  const [vendor, setVendor] = useState(order?.vendor ?? "");
  const [parts, setParts] = useState(order?.partsCost ? String(order.partsCost) : "");
  const [labour, setLabour] = useState(order?.labourCost ? String(order.labourCost) : "");
  const [paidFrom, setPaidFrom] = useState(order?.paidFrom ?? "1010");
  const vehicle = vehicles.find((v) => v.truck === truck);
  const [odometer, setOdometer] = useState(order?.odometerKm ? String(order.odometerKm) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closing = status === "done";
  const total = (num(parts) || 0) + (num(labour) || 0);

  const submit = async () => {
    if (!title.trim()) return setError("Say what the job is.");
    const partsCost = parts.trim() ? num(parts) : 0;
    const labourCost = labour.trim() ? num(labour) : 0;
    if (!(partsCost >= 0 && labourCost >= 0)) return setError("Costs must be numbers.");
    const km = odometer.trim() ? num(odometer) : undefined;
    if (km !== undefined && !(km > 0)) return setError("Enter a valid odometer reading.");
    if (closing && kind === "service" && km === undefined) return setError("Enter the odometer reading the service was done at.");
    setBusy(true);
    setError("");
    const res = await run(
      actions.saveWorkOrder({
        id: order?.id,
        truck,
        kind,
        title,
        detail,
        status,
        vendor,
        partsCost: Math.round(partsCost),
        labourCost: Math.round(labourCost),
        paidFrom,
        odometerKm: km,
      }),
      onClose,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <FormSheet
      title={order ? `Work order ${order.id}` : "New work order"}
      icon={<Wrench size={19} strokeWidth={2.2} aria-hidden="true" />}
      wide
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<Footer busy={busy} label={order ? "Save" : "Open work order"} onClose={onClose} />}
    >
      {order?.inspection && <p className="hint">Raised by {order.openedBy}&rsquo;s daily check on {order.openedAt}.</p>}
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Truck
          <select value={truck} disabled={Boolean(order)} onChange={(e) => setTruck(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.truck}>{v.truck}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as WorkOrderKind)}>
            {(Object.keys(WORK_ORDER_KIND_LABEL) as WorkOrderKind[]).map((k) => (
              <option key={k} value={k}>
                {WORK_ORDER_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as WorkOrderStatus)}>
            {(Object.keys(WORK_ORDER_STATUS_LABEL) as WorkOrderStatus[]).map((k) => (
              <option key={k} value={k}>
                {WORK_ORDER_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="f" style={{ marginTop: 12 }}>
        Job
        <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace rear brake pads" />
      </label>
      <label className="f" style={{ marginTop: 12 }}>
        Notes <span className="hint">(optional)</span>
        <textarea rows={2} maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Garage or supplier
          <input maxLength={80} value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </label>
        <label className="f">
          Parts (KES)
          <input inputMode="numeric" value={parts} onChange={(e) => setParts(e.target.value)} placeholder="0" />
        </label>
        <label className="f">
          Labour (KES)
          <input inputMode="numeric" value={labour} onChange={(e) => setLabour(e.target.value)} placeholder="0" />
        </label>
        <label className="f">
          Paid by
          <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
            {PAYMENT_ACCOUNTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Odometer (km) {kind === "service" && closing ? "" : <span className="hint">(optional)</span>}
          <input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder={vehicle ? `Now ~${group(vehicle.odometerKm)}` : ""} />
        </label>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {status === "in_progress"
          ? "While it's in the workshop the truck shows as off its route."
          : closing
            ? total > 0
              ? `Closing posts KES ${group(total)} to Vehicle maintenance in the books.`
              : "Closing with no cost posts nothing to the books."
            : "Costs post to the books when the job is marked done."}
        {closing && kind === "service" ? " The service schedule restarts from this reading." : ""}
      </p>
    </FormSheet>
  );
}

/* ---------------- documents ---------------- */

export interface DocumentDraft {
  subjectType: DocSubject;
  subject: string;
  kind?: string;
}

export function DocumentForm({
  draft,
  subjects,
  today,
  run,
  onClose,
}: {
  draft?: DocumentDraft;
  subjects: { type: DocSubject; id: string; name: string }[];
  today: string;
  run: Run;
  onClose: () => void;
}) {
  const actions = useActions();
  const first = draft ?? { subjectType: subjects[0]?.type ?? "vehicle", subject: subjects[0]?.id ?? "" };
  const [key, setKey] = useState(`${first.subjectType}|${first.subject}`);
  const [subjectType, subject] = key.split("|") as [DocSubject, string];
  const kinds = DOC_KINDS.filter((k) => k.subject === subjectType);
  const [kind, setKind] = useState(draft?.kind ?? kinds[0]?.key ?? "");
  const [number, setNumber] = useState("");
  const [expiresOn, setExpiresOn] = useState(addDays(today, 365));
  const [cost, setCost] = useState("");
  const [paidFrom, setPaidFrom] = useState("1010");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const validKind = kinds.some((k) => k.key === kind) ? kind : kinds[0]?.key ?? "";

  const submit = async () => {
    const c = cost.trim() ? num(cost) : 0;
    if (!(c >= 0)) return setError("Enter what it cost, or leave it blank.");
    setBusy(true);
    setError("");
    const res = await run(
      actions.saveDocument({ subjectType, subject, kind: validKind, number, expiresOn, cost: Math.round(c), paidFrom }),
      onClose,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <FormSheet
      title="Record a document"
      icon={<FileBadge size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<Footer busy={busy} label="Save" onClose={onClose} />}
    >
      <p className="hint">A renewal replaces the old one. What it cost posts to Licences &amp; permits in the books.</p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          For
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <optgroup label="Trucks">
              {subjects
                .filter((s) => s.type === "vehicle")
                .map((s) => (
                  <option key={s.id} value={`vehicle|${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Drivers">
              {subjects
                .filter((s) => s.type === "driver")
                .map((s) => (
                  <option key={s.id} value={`driver|${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label className="f">
          Document
          <select value={validKind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Number <span className="hint">(optional)</span>
          <input maxLength={40} value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label className="f">
          Valid until
          <input type="date" required value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </label>
        <label className="f">
          Cost (KES) <span className="hint">(optional)</span>
          <input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="f">
          Paid by
          <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
            {PAYMENT_ACCOUNTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </FormSheet>
  );
}

/* ---------------- vehicle register ---------------- */

export function VehicleForm({ vehicle, run, onClose }: { vehicle: Vehicle; run: Run; onClose: () => void }) {
  const actions = useActions();
  const [f, setF] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    capacityKg: String(vehicle.capacityKg),
    tankL: String(vehicle.tankL),
    serviceEveryKm: String(vehicle.serviceEveryKm),
    serviceEveryDays: String(vehicle.serviceEveryDays),
    expectedKmPerL: String(vehicle.expectedKmPerL),
    state: vehicle.state,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    const patch: Partial<VehiclePatch> = {
      make: f.make,
      model: f.model,
      year: num(f.year),
      capacityKg: num(f.capacityKg),
      tankL: num(f.tankL),
      serviceEveryKm: num(f.serviceEveryKm),
      serviceEveryDays: num(f.serviceEveryDays),
      expectedKmPerL: num(f.expectedKmPerL),
      state: f.state,
    };
    setBusy(true);
    setError("");
    const res = await run(actions.updateVehicle(vehicle.truck, patch), onClose);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <FormSheet
      title={`Edit ${vehicle.truck}`}
      icon={<Truck size={19} strokeWidth={2.2} aria-hidden="true" />}
      wide
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<Footer busy={busy} label="Save" onClose={onClose} />}
    >
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Make
          <input value={f.make} onChange={set("make")} />
        </label>
        <label className="f">
          Model
          <input value={f.model} onChange={set("model")} />
        </label>
        <label className="f">
          Year
          <input inputMode="numeric" value={f.year} onChange={set("year")} />
        </label>
        <label className="f">
          Payload (kg)
          <input inputMode="numeric" value={f.capacityKg} onChange={set("capacityKg")} />
        </label>
        <label className="f">
          Tank (litres)
          <input inputMode="numeric" value={f.tankL} onChange={set("tankL")} />
        </label>
        <label className="f">
          Expected km per litre
          <input inputMode="decimal" value={f.expectedKmPerL} onChange={set("expectedKmPerL")} />
        </label>
        <label className="f">
          Service every (km)
          <input inputMode="numeric" value={f.serviceEveryKm} onChange={set("serviceEveryKm")} />
        </label>
        <label className="f">
          …or every (days)
          <input inputMode="numeric" value={f.serviceEveryDays} onChange={set("serviceEveryDays")} />
        </label>
        <label className="f">
          Status
          <select value={f.state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value as Vehicle["state"] }))}>
            {(Object.keys(VEHICLE_STATE_LABEL) as Vehicle["state"][]).map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Status also follows the workshop: a job in progress puts the truck in the workshop, a critical defect takes it off the road.
      </p>
    </FormSheet>
  );
}

/* ---------------- rules ---------------- */

export function RulesForm({ company, settings, run, onClose }: { company: string; settings: FleetSettings; run: Run; onClose: () => void }) {
  const actions = useActions();
  const [f, setF] = useState({
    speedLimitKmh: String(settings.speedLimitKmh),
    idleMinutes: String(settings.idleMinutes),
    dayStart: settings.dayStart,
    dayEnd: settings.dayEnd,
    fuelAlertPct: String(settings.fuelAlertPct),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError("");
    const res = await run(
      actions.saveFleetSettings(company, {
        speedLimitKmh: num(f.speedLimitKmh),
        idleMinutes: num(f.idleMinutes),
        dayStart: f.dayStart,
        dayEnd: f.dayEnd,
        fuelAlertPct: num(f.fuelAlertPct),
      }),
      onClose,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <FormSheet
      title="Fleet rules"
      icon={<SlidersHorizontal size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<Footer busy={busy} label="Save rules" onClose={onClose} />}
    >
      <p className="hint">What counts as speeding, idling and after-hours use. Applies to GPS positions from now on.</p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Speed limit (km/h)
          <input inputMode="numeric" value={f.speedLimitKmh} onChange={set("speedLimitKmh")} />
        </label>
        <label className="f">
          Idling after (minutes)
          <input inputMode="numeric" value={f.idleMinutes} onChange={set("idleMinutes")} />
        </label>
        <label className="f">
          Working day starts
          <input type="time" value={f.dayStart} onChange={set("dayStart")} />
        </label>
        <label className="f">
          …and ends
          <input type="time" value={f.dayEnd} onChange={set("dayEnd")} />
        </label>
        <label className="f">
          Fuel alert below expected (%)
          <input inputMode="numeric" value={f.fuelAlertPct} onChange={set("fuelAlertPct")} />
        </label>
      </div>
    </FormSheet>
  );
}
