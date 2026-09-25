"use client";

import {
  Armchair,
  CalendarDays,
  Check,
  CircleCheck,
  ClipboardList,
  HardHat,
  Leaf,
  LoaderCircle,
  PartyPopper,
  ShoppingBag,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { PICKUP_KINDS } from "@/lib/integrations";
import { clientById, nowIn } from "@/lib/selectors";
import type { PickupRequest } from "@/lib/types";
import { uploadPhoto } from "@/store/actions";
import { useActions, useAppState } from "@/store/StoreProvider";

const KIND_ICON: Record<string, LucideIcon> = {
  bulky: Armchair,
  garden: Leaf,
  rubble: HardHat,
  extra: ShoppingBag,
  event: PartyPopper,
};

const STATUS_TONE: Record<PickupRequest["status"], "neutral" | "warn" | "ok" | "bad"> = {
  Requested: "warn",
  Scheduled: "neutral",
  Completed: "ok",
  Cancelled: "bad",
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** On-demand collections: bulky items, garden waste, rubble, events. */
export function ClientPickups() {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { t } = useT();
  const client = clientById(s, s.clientId);

  const today = ymd(nowIn(s));
  const tomorrow = ymd(new Date(nowIn(s).getTime() + 86_400_000));
  const [kind, setKind] = useState<string>("bulky");
  const [date, setDate] = useState(tomorrow);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!client) return null;
  const prices = Object.fromEntries(
    (s.pricing[client.company] ?? []).map((p) => [p.kind, p.price]),
  );
  const mine = s.pickupRequests.filter((r) => r.client === client.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const photoId = photo ? await uploadPhoto(photo) : undefined;
      const res = await actions.requestPickup({
        client: client.id,
        kind,
        notes,
        preferredDate: date,
        photo: photoId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(res.message ?? t("Pickup booked"));
      setNotes("");
      setPhoto(null);
      // Offer to pay straight away; it can also wait for the next bill.
      if (res.id) actions.openStk(client.id, { amount: prices[kind], purpose: `pickup:${res.id}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book the pickup.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={t("Book a pickup")} icon={ClipboardList}>
        {t(
          "Extra and bulky collections on top of your regular days. Pay by M-Pesa now, or with your next bill.",
        )}
      </PageHead>

      <div className="grid g-main">
        <Panel title={t("What needs collecting?")} icon={ClipboardList}>
          <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
            <div className="kind-grid" role="radiogroup" aria-label={t("What needs collecting?")}>
              {PICKUP_KINDS.map((k) => {
                const Icon = KIND_ICON[k.key] ?? ClipboardList;
                return (
                  <button
                    type="button"
                    key={k.key}
                    role="radio"
                    aria-checked={kind === k.key}
                    className="kind"
                    onClick={() => setKind(k.key)}
                  >
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                    <b>{t(k.label)}</b>
                    <span>{kes(prices[k.key] ?? 0)}</span>
                  </button>
                );
              })}
            </div>

            <div className="form">
              <label className="f">
                {t("Preferred date")}
                <span className="field">
                  <CalendarDays size={15} strokeWidth={2.2} aria-hidden="true" />
                  <input
                    type="date"
                    min={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </span>
              </label>
            </div>
            <label className="f">
              {t("Notes for the crew")}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder={t("What and how much, where it is, gate details")}
              />
            </label>
            <PhotoInput
              value={photo}
              onChange={setPhoto}
              label={t("Add a photo (helps the crew bring the right truck)")}
            />

            {error && <div className="err">{error}</div>}
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
                ) : (
                  <Check size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {t("Book for {amount}", { amount: kes(prices[kind] ?? 0) })}
              </button>
              <span className="hint">{t("We’ll confirm the date by SMS.")}</span>
            </div>
          </form>
        </Panel>

        <Panel title={t("Your requests")} icon={CalendarDays}>
          {mine.length === 0 ? (
            <Empty icon={ClipboardList}>{t("No pickups booked yet.")}</Empty>
          ) : (
            <div className="list">
              {mine.map((r) => {
                const k = PICKUP_KINDS.find((x) => x.key === r.kind);
                const Icon = KIND_ICON[r.kind] ?? ClipboardList;
                return (
                  <div className="li" key={r.id} style={{ flexWrap: "wrap" }}>
                    <div className="li-main">
                      <span className="itile sm neutral" aria-hidden="true">
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <div>
                        <div className="t">
                          {t(k?.label ?? r.kind)} · {kes(r.price)}
                        </div>
                        <div className="sub">
                          <span className="mono">{r.id}</span> ·{" "}
                          {r.scheduledFor
                            ? t("Scheduled {date}", { date: fmtDate(r.scheduledFor) })
                            : t("Wanted {date}", { date: fmtDate(r.preferredDate) })}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <Chip tone={STATUS_TONE[r.status]}>{t(r.status)}</Chip>
                      {r.paid ? (
                        <Chip tone="ok" icon={CircleCheck}>
                          {t("Paid")}
                        </Chip>
                      ) : r.status !== "Cancelled" ? (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            actions.openStk(client.id, {
                              amount: r.price,
                              purpose: `pickup:${r.id}`,
                            })
                          }
                        >
                          <Smartphone size={14} strokeWidth={2.2} aria-hidden="true" />
                          {t("Pay")}
                        </button>
                      ) : null}
                      {r.status === "Requested" && !r.paid && (
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={async () => {
                            const res = await actions.updatePickup(r.id, { status: "Cancelled" });
                            toast(res.ok ? t("Request cancelled") : res.error);
                          }}
                        >
                          <X size={14} strokeWidth={2.2} aria-hidden="true" />
                          {t("Cancel")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
