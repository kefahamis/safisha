"use client";

import { CalendarCheck, Check, CircleCheck, ClipboardList, Image as ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes } from "@/lib/format";
import { PICKUP_KINDS } from "@/lib/integrations";
import { companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import { clientById, trucksOf } from "@/lib/selectors";
import type { PickupRequest } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

const TONE: Record<PickupRequest["status"], "neutral" | "warn" | "ok" | "bad"> = {
  Requested: "warn",
  Scheduled: "neutral",
  Completed: "ok",
  Cancelled: "bad",
};

/** Schedule, assign and complete the on-demand pickups clients book. */
export function CompanyPickups() {
  const s = useAppState();
  const co = companyById(s.companyId);
  const list = s.pickupRequests.filter((r) => r.company === co.id);
  const open = list.filter((r) => r.status === "Requested" || r.status === "Scheduled");
  const done = list.filter((r) => r.status === "Completed" || r.status === "Cancelled");

  return (
    <>
      <PageHead title="Pickup requests" icon={ClipboardList}>
        Bulky and extra collections booked by clients in the app or by USSD. Prices are set under Settings.
      </PageHead>
      <Panel title={`Open · ${open.length}`} icon={CalendarCheck}>
        {open.length === 0 ? (
          <Empty icon={CircleCheck}>Nothing waiting.</Empty>
        ) : (
          <div className="list">
            {open.map((r) => (
              <RequestRow key={r.id} req={r} trucks={trucksOf(s, co.id).map((t) => t.id)} />
            ))}
          </div>
        )}
      </Panel>
      {done.length > 0 && (
        <Panel title="Recent" icon={ClipboardList}>
          <div className="list">
            {done.slice(0, 20).map((r) => (
              <RequestRow key={r.id} req={r} trucks={[]} />
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function RequestRow({ req, trucks }: { req: PickupRequest; trucks: string[] }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const client = clientById(s, req.client);
  const [date, setDate] = useState(req.scheduledFor ?? req.preferredDate);
  const [truck, setTruck] = useState(req.truck ?? trucks[0] ?? "");
  const kind = PICKUP_KINDS.find((k) => k.key === req.kind);
  const run = async (patch: Parameters<typeof actions.updatePickup>[1], ok: string) => {
    const res = await actions.updatePickup(req.id, patch);
    toast(res.ok ? ok : res.error);
  };

  return (
    <div className="li" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: "1 1 280px" }}>
        <div className="t">
          {kind?.label ?? req.kind} · {kes(req.price)}{" "}
          {req.paid && (
            <Chip tone="ok" icon={CircleCheck}>
              Paid
            </Chip>
          )}
        </div>
        <div className="sub">
          <span className="mono">{req.id}</span> · {client?.name} ({client ? estateName(client.estate) : req.client}) ·
          wanted {fmtDate(req.preferredDate)}
        </div>
        {req.notes && <div className="sub">“{req.notes}”</div>}
        {req.photo && (
          <a className="sub with-ico" href={`/api/files/${req.photo}`} target="_blank" rel="noreferrer">
            <ImageIcon size={13} strokeWidth={2.2} aria-hidden="true" />
            Photo
          </a>
        )}
      </div>

      {req.status === "Requested" || req.status === "Scheduled" ? (
        <div className="row" style={{ gap: 6 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <select value={truck} onChange={(e) => setTruck(e.target.value)} aria-label="Truck">
            {trucks.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn small primary"
            onClick={() => run({ status: "Scheduled", scheduledFor: date, truck }, `${req.id} scheduled; client notified`)}
          >
            <CalendarCheck size={14} strokeWidth={2.2} aria-hidden="true" />
            {req.status === "Scheduled" ? "Reschedule" : "Schedule"}
          </button>
          {req.status === "Scheduled" && (
            <button type="button" className="btn small" onClick={() => run({ status: "Completed" }, `${req.id} completed`)}>
              <Check size={14} strokeWidth={2.2} aria-hidden="true" />
              Done
            </button>
          )}
          <button type="button" className="btn small ghost" onClick={() => run({ status: "Cancelled" }, `${req.id} cancelled`)}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : (
        <Chip tone={TONE[req.status]}>{req.status}</Chip>
      )}
    </div>
  );
}
