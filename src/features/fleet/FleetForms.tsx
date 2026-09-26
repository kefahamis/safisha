"use client";

import { Check, CircleAlert, ClipboardCheck, Fuel, LoaderCircle, MapPin, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { currentPosition, PhotoInput } from "@/components/ui/PhotoInput";
import type { CommandResult } from "@/lib/commands";
import { CHECK_ITEMS, INCIDENT_KINDS, PAYMENT_ACCOUNTS, type CheckAnswer, type IncidentKind } from "@/lib/fleet";
import { group } from "@/lib/format";
import { useActions } from "@/store/StoreProvider";

/** A modal form sheet: title row, body, and the standard error line. */
export function FormSheet({
  title,
  icon,
  wide,
  onClose,
  onSubmit,
  error,
  children,
  footer,
}: {
  title: string;
  icon?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  onSubmit?: (e: FormEvent) => void;
  error?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className={`sheet fleet-sheet${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <div className="row between fleet-sheet-head">
          <h2 className="with-ico">
            {icon}
            {title}
          </h2>
          <button type="button" className="btn small ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        {children}
        {error && (
          <p className="err" role="alert">
            <CircleAlert size={15} strokeWidth={2.2} aria-hidden="true" />
            {error}
          </p>
        )}
        {footer && <div className="row fleet-sheet-foot">{footer}</div>}
      </form>
    </div>
  );
}

function SubmitRow({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
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

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")));

/* ---------------- daily check ---------------- */

/** The start-of-day walk-round: every item answered, then the odometer. */
export function CheckForm({
  truck,
  lastOdometer,
  onClose,
  onDone,
}: {
  truck: string;
  lastOdometer: number;
  onClose: () => void;
  onDone: (res: CommandResult) => void;
}) {
  const actions = useActions();
  const [items, setItems] = useState<Record<string, CheckAnswer | undefined>>({});
  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const answered = CHECK_ITEMS.filter((i) => items[i.key]).length;
  const defects = CHECK_ITEMS.filter((i) => items[i.key] === "defect");
  const critical = defects.some((i) => i.critical);

  const submit = async () => {
    if (answered < CHECK_ITEMS.length) return setError(`Answer every item: ${CHECK_ITEMS.length - answered} left.`);
    const km = num(odometer);
    if (!(km > 0)) return setError("Enter the odometer reading.");
    if (km < lastOdometer - 1) return setError(`The odometer can't go backwards: the last reading was ${group(lastOdometer)} km.`);
    if (defects.length && !notes.trim()) return setError("Describe the defect so the workshop knows what to fix.");
    setBusy(true);
    setError("");
    const res = await actions.fleetRecord(
      { type: "fleet.check", truck, odometerKm: km, items: items as Record<string, CheckAnswer>, notes },
      photo,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res);
  };

  return (
    <FormSheet
      title="Start-of-day check"
      icon={<ClipboardCheck size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<SubmitRow busy={busy} label="Save check" onClose={onClose} />}
    >
      <p className="hint">
        Walk round <span className="mono">{truck}</span> before you drive. Mark anything that isn&rsquo;t right as a defect.
      </p>
      <div className="row between" style={{ margin: "12px 0 6px" }}>
        <span className="label">
          {answered} of {CHECK_ITEMS.length} checked
        </span>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => setItems(Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, items[i.key] ?? "ok"])))}
        >
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          Mark the rest OK
        </button>
      </div>
      <div className="check-list">
        {CHECK_ITEMS.map((i) => (
          <div key={i.key} className={`check-item${items[i.key] === "defect" ? " defect" : ""}`}>
            <div>
              <div className="t">
                {i.label}
                {i.critical && <span className="check-critical">Safety-critical</span>}
              </div>
              {i.hint && <div className="hint">{i.hint}</div>}
            </div>
            <div className="segmented" role="radiogroup" aria-label={i.label}>
              {(["ok", "defect"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={items[i.key] === v}
                  className={v}
                  onClick={() => setItems((x) => ({ ...x, [i.key]: v }))}
                >
                  {v === "ok" ? "OK" : "Defect"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {critical && (
        <div className="banner bad" style={{ marginTop: 12 }}>
          <ShieldAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          A safety-critical defect takes the truck off the road until the workshop clears it.
        </div>
      )}

      <div className="form" style={{ marginTop: 14 }}>
        <label className="f">
          Odometer (km)
          <input
            inputMode="numeric"
            required
            placeholder={lastOdometer ? `Last: ${group(lastOdometer)}` : "e.g. 186400"}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
        </label>
      </div>
      <label className="f" style={{ marginTop: 12 }}>
        Notes {defects.length ? "" : <span className="hint">(optional)</span>}
        <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={defects.length ? "What's wrong?" : ""} />
      </label>
      {defects.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <PhotoInput value={photo} onChange={setPhoto} label="Photo of the defect" />
        </div>
      )}
    </FormSheet>
  );
}

/* ---------------- fuel ---------------- */

export function FuelForm({
  truck,
  trucks,
  lastOdometer,
  onClose,
  onDone,
}: {
  truck: string;
  /** For the office: pick which truck; a driver only has their own. */
  trucks?: { id: string; odometer: number }[];
  lastOdometer: number;
  onClose: () => void;
  onDone: (res: CommandResult) => void;
}) {
  const actions = useActions();
  const [plate, setPlate] = useState(truck);
  const [litres, setLitres] = useState("");
  const [amount, setAmount] = useState("");
  const [odometer, setOdometer] = useState("");
  const [station, setStation] = useState("");
  const [paidFrom, setPaidFrom] = useState("1000");
  const [reference, setReference] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = trucks?.find((x) => x.id === plate)?.odometer ?? lastOdometer;
  const perLitre = num(amount) / num(litres);

  const submit = async () => {
    const l = num(litres);
    const a = num(amount);
    const km = num(odometer);
    if (!(l > 0)) return setError("Enter the litres.");
    if (!(a > 0)) return setError("Enter the amount paid.");
    if (!(km > 0)) return setError("Enter the odometer reading.");
    if (km < last - 1) return setError(`The odometer can't go backwards: the last reading was ${group(last)} km.`);
    setBusy(true);
    setError("");
    const res = await actions.fleetRecord(
      {
        type: "fleet.fuel",
        truck: plate,
        litres: l,
        amount: Math.round(a),
        odometerKm: km,
        station,
        paidFrom,
        reference: reference || undefined,
      },
      photo,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res);
  };

  return (
    <FormSheet
      title="Log fuel"
      icon={<Fuel size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<SubmitRow busy={busy} label="Save fill" onClose={onClose} />}
    >
      <p className="hint">Fill to full each time so the km per litre is accurate. It posts to Fuel in the books.</p>
      <div className="form" style={{ marginTop: 12 }}>
        {trucks && (
          <label className="f">
            Truck
            <select value={plate} onChange={(e) => setPlate(e.target.value)}>
              {trucks.map((x) => (
                <option key={x.id}>{x.id}</option>
              ))}
            </select>
          </label>
        )}
        <label className="f">
          Litres
          <input inputMode="decimal" required value={litres} onChange={(e) => setLitres(e.target.value)} />
        </label>
        <label className="f">
          Amount (KES)
          <input inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="f">
          Odometer (km)
          <input inputMode="numeric" required placeholder={last ? `Last: ${group(last)}` : ""} value={odometer} onChange={(e) => setOdometer(e.target.value)} />
        </label>
        <label className="f">
          Station
          <input maxLength={60} placeholder="e.g. Rubis Ngong Road" value={station} onChange={(e) => setStation(e.target.value)} />
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
          M-Pesa code or receipt <span className="hint">(optional)</span>
          <input maxLength={40} value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} />
        </label>
      </div>
      {Number.isFinite(perLitre) && perLitre > 0 && <p className="hint" style={{ marginTop: 8 }}>KES {perLitre.toFixed(1)} a litre.</p>}
      <div style={{ marginTop: 12 }}>
        <PhotoInput value={photo} onChange={setPhoto} label="Photo of the receipt" />
      </div>
    </FormSheet>
  );
}

/* ---------------- incidents ---------------- */

export function IncidentForm({ truck, onClose, onDone }: { truck: string; onClose: () => void; onDone: (res: CommandResult) => void }) {
  const actions = useActions();
  const [kind, setKind] = useState<IncidentKind>("accident");
  const [severity, setSeverity] = useState<"minor" | "major">("minor");
  const [description, setDescription] = useState("");
  const [policeRef, setPoliceRef] = useState("");
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const locate = async () => {
    setLocating(true);
    const p = await currentPosition();
    setLocating(false);
    if (p) setWhere(p);
    else setError("Couldn't get your location. Describe where it happened instead.");
  };

  const submit = async () => {
    if (description.trim().length < 5) return setError("Describe what happened.");
    setBusy(true);
    setError("");
    const res = await actions.fleetRecord(
      {
        type: "fleet.incident",
        truck,
        kind,
        severity,
        description,
        policeRef: policeRef || undefined,
        lat: where?.lat,
        lng: where?.lng,
      },
      photo,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res);
  };

  return (
    <FormSheet
      title="Report an incident"
      icon={<TriangleAlert size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={<SubmitRow busy={busy} label="Send report" onClose={onClose} />}
    >
      <p className="hint">
        For <span className="mono">{truck}</span>. If anyone is hurt, call 999 first.
      </p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          What happened
          <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}>
            {INCIDENT_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="f">
          <span className="label">How serious</span>
          <div className="segmented" role="radiogroup" aria-label="How serious">
            {(["minor", "major"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={severity === v} onClick={() => setSeverity(v)}>
                {v === "minor" ? "Minor" : "Major"}
              </button>
            ))}
          </div>
        </div>
        {(kind === "accident" || kind === "theft") && (
          <label className="f">
            Police OB number <span className="hint">(if reported)</span>
            <input maxLength={40} value={policeRef} onChange={(e) => setPoliceRef(e.target.value)} />
          </label>
        )}
      </div>
      <label className="f" style={{ marginTop: 12 }}>
        Details
        <textarea rows={3} maxLength={1000} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where, what happened, anyone else involved" />
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn small ghost" onClick={locate} disabled={locating}>
          {locating ? <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" /> : <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />}
          {where ? "Location added" : "Add my location"}
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <PhotoInput value={photo} onChange={setPhoto} label="Photo" />
      </div>
    </FormSheet>
  );
}
