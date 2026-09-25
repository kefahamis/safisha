"use client";

import {
  Camera,
  Check,
  CircleAlert,
  ClipboardList,
  CloudOff,
  DoorClosed,
  Eye,
  ListChecks,
  LoaderCircle,
  MapPin,
  Route,
  Sparkles,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Chip } from "@/components/ui/Chip";
import { currentPosition, PhotoInput } from "@/components/ui/PhotoInput";
import { useToast } from "@/components/ui/ToastProvider";
import { kes } from "@/lib/format";
import { PICKUP_KINDS } from "@/lib/integrations";
import { estateName } from "@/lib/reference/estates";
import { balance, clientById, nowIn } from "@/lib/selectors";
import type { Client, StopStatus, Truck, WasteStream } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

const STREAMS: { value: WasteStream; label: string }[] = [
  { value: "mixed", label: "Mixed" },
  { value: "recyclable", label: "Recyclable" },
  { value: "organic", label: "Organic" },
  { value: "residual", label: "Residual" },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Today's stop list for one truck, in route order (or the optimised order). */
export function RouteSheet({ truck }: { truck: Truck }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const mayComplete = can("route.complete");
  const [capture, setCapture] = useState<{ client: Client; status: StopStatus } | null>(null);
  const [optimising, setOptimising] = useState(false);

  const estates = [...new Set(truck.route)];
  const fixed = estates.flatMap((e) => s.clients.filter((c) => c.company === truck.company && c.estate === e));
  const saved = s.routeOrders[truck.id];
  // Use the optimiser's order when there is one; any new client goes at the end.
  const stops = saved
    ? [
        ...saved.order.map((id) => fixed.find((c) => c.id === id)).filter((c): c is Client => Boolean(c)),
        ...fixed.filter((c) => !saved.order.includes(c.id)),
      ]
    : fixed;
  const sheet = s.stops[truck.id] ?? {};
  const done = stops.filter((c) => sheet[c.id]).length;
  const today = ymd(nowIn(s));
  const onDemand = s.pickupRequests.filter(
    (r) => r.truck === truck.id && r.status === "Scheduled" && (r.scheduledFor ?? r.preferredDate) <= today,
  );

  const optimise = async () => {
    setOptimising(true);
    const res = await actions.optimiseRoute(truck.id);
    setOptimising(false);
    toast(res.ok ? (res.message ?? "Route reordered") : res.error);
  };

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h3 className="with-ico">
          <ListChecks size={17} strokeWidth={2.2} aria-hidden="true" />
          {done} of {stops.length} stops done
        </h3>
        <div className="row" style={{ gap: 8 }}>
          {s.pending > 0 && (
            <Chip tone="warn" icon={CloudOff}>
              {s.pending} waiting to sync
            </Chip>
          )}
          {mayComplete && (
            <button type="button" className="btn small" onClick={optimise} disabled={optimising}>
              {optimising ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              Optimise order
            </button>
          )}
        </div>
      </div>
      <div className="hint with-ico" style={{ marginBottom: 6 }}>
        <Route size={14} strokeWidth={2.2} aria-hidden="true" />
        {saved
          ? `Optimised: ${(saved.distanceM / 1000).toFixed(1)} km instead of ${(saved.baselineM / 1000).toFixed(1)} km by estate order`
          : estates.map(estateName).join(" → ")}
      </div>
      <div className="route-progress" aria-hidden="true">
        <i style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} />
      </div>

      {onDemand.length > 0 && (
        <div className="ondemand">
          <div className="label with-ico">
            <ClipboardList size={13} strokeWidth={2.2} aria-hidden="true" />
            On-demand today
          </div>
          {onDemand.map((r) => {
            const c = clientById(s, r.client);
            return (
              <div className="li" key={r.id}>
                <div>
                  <div className="t">
                    {PICKUP_KINDS.find((k) => k.key === r.kind)?.label} · {c?.name}
                  </div>
                  <div className="sub">
                    <span className="mono">{r.id}</span> · {c ? estateName(c.estate) : ""} · {kes(r.price)}
                    {r.notes ? ` · “${r.notes}”` : ""}
                  </div>
                </div>
                {mayComplete && (
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={async () => {
                      const res = await actions.updatePickup(r.id, { status: "Completed" });
                      toast(res.ok ? `${r.id} done` : res.error);
                    }}
                  >
                    <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                    Done
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stops.map((c, i) => {
        const status = sheet[c.id];
        const proof = s.proofs[`${truck.id}|${c.id}`];
        const rowClass = status === "Collected" ? "stop done" : status === "Skipped" ? "stop skipped" : "stop";
        return (
          <div className={rowClass} key={c.id}>
            <span className="n">
              {status === "Collected" ? (
                <Check size={15} strokeWidth={3} aria-label="Collected" />
              ) : status === "Skipped" ? (
                <TriangleAlert size={14} strokeWidth={2.6} aria-label="Skipped" />
              ) : (
                i + 1
              )}
            </span>
            <div>
              <div style={{ fontWeight: 650 }}>{c.name}</div>
              <div className="hint">
                <span className="mono">{c.id}</span> · {estateName(c.estate)} · {c.type}
                {balance(s, c.id) > c.plan && (
                  <span className="unpaid">
                    <CircleAlert size={12} strokeWidth={2.2} aria-hidden="true" />
                    2+ months unpaid
                  </span>
                )}
              </div>
              {proof && (
                <div className="proof">
                  {proof.photo && (
                    <a href={`/api/files/${proof.photo}`} target="_blank" rel="noreferrer" className="with-ico">
                      <Camera size={12} strokeWidth={2.2} aria-hidden="true" />
                      Photo
                    </a>
                  )}
                  {proof.weightKg !== undefined && <span>{proof.weightKg} kg</span>}
                  {proof.stream && <span>{proof.stream}</span>}
                  {proof.lat !== undefined && (
                    <span className="with-ico">
                      <MapPin size={12} strokeWidth={2.2} aria-hidden="true" />
                      GPS
                    </span>
                  )}
                  <span>{proof.at}</span>
                </div>
              )}
            </div>
            <div className="row">
              {!mayComplete ? (
                status ? (
                  <Chip tone={status === "Collected" ? "ok" : "warn"} icon={status === "Collected" ? Check : TriangleAlert}>
                    {status}
                  </Chip>
                ) : (
                  <span className="hint with-ico">
                    <Eye size={14} strokeWidth={2.2} aria-hidden="true" />
                    View only
                  </span>
                )
              ) : status ? (
                <>
                  <Chip tone={status === "Collected" ? "ok" : "warn"} icon={status === "Collected" ? Check : TriangleAlert}>
                    {status}
                  </Chip>
                  <button type="button" className="btn small ghost" onClick={() => actions.undoStop(truck.id, c.id)}>
                    <Undo2 size={14} strokeWidth={2.2} aria-hidden="true" />
                    Undo
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => setCapture({ client: c, status: "Collected" })}
                  >
                    <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                    Collected
                  </button>
                  <button type="button" className="btn small" onClick={() => setCapture({ client: c, status: "Skipped" })}>
                    <DoorClosed size={14} strokeWidth={2.2} aria-hidden="true" />
                    No access
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {capture && <ProofSheet truck={truck} target={capture} onClose={() => setCapture(null)} />}
    </div>
  );
}

/**
 * Proof of collection: a photo, the GPS fix, and (when collected) the weight
 * and waste stream. Everything but the status is optional so a crew is never
 * blocked; it saves offline and syncs later if there's no signal.
 */
function ProofSheet({
  truck,
  target,
  onClose,
}: {
  truck: Truck;
  target: { client: Client; status: StopStatus };
  onClose: () => void;
}) {
  const actions = useActions();
  const toast = useToast();
  const collected = target.status === "Collected";
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [weight, setWeight] = useState("");
  const [stream, setStream] = useState<WasteStream>("mixed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const pos = await currentPosition(5000);
    const kg = Number(weight);
    const res = await actions.markStop(truck.id, target.client.id, target.status, {
      photo: photo ?? undefined,
      lat: pos?.lat,
      lng: pos?.lng,
      weightKg: collected && weight !== "" && kg >= 0 ? kg : undefined,
      stream: collected ? stream : undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    toast(res.message ?? (collected ? "Collection recorded" : "Client notified via customer care"));
    onClose();
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Record stop" onSubmit={save}>
        <div className="row between">
          <h2>{collected ? "Record collection" : "Couldn’t collect"}</h2>
          <button type="button" className="btn small ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <p className="hint">
          {target.client.name} · <span className="mono">{target.client.id}</span>
        </p>

        <div className="stack" style={{ gap: 14 }}>
          <PhotoInput
            value={photo}
            onChange={setPhoto}
            label={collected ? "Photo of the emptied bin (optional)" : "Photo of the locked gate (recommended)"}
          />
          {collected && (
            <>
              <label className="f">
                Weight (kg)
                <input type="number" inputMode="decimal" min={0} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Optional" />
              </label>
              <div className="segmented" role="radiogroup" aria-label="Waste stream">
                {STREAMS.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={stream === o.value} onClick={() => setStream(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="f">
            Note {collected ? "(optional)" : "for the client"}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={collected ? "" : "e.g. Gate locked, askari absent"} />
          </label>
          <p className="hint with-ico" style={{ margin: 0 }}>
            <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
            Your location is attached automatically if the phone allows it.
          </p>
          <button className="btn primary block" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
            ) : (
              <Check size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
            {collected ? "Save collection" : "Save and notify client"}
          </button>
        </div>
      </form>
    </div>
  );
}
