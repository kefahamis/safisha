"use client";

import { Crosshair, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PinMap } from "@/components/map/PinMap";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { currentPosition, PhotoInput } from "@/components/ui/PhotoInput";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { estateName } from "@/lib/reference/estates";
import type { DumpReport, LatLng } from "@/lib/types";
import { uploadPhoto } from "@/store/actions";
import { useActions, useAppState } from "@/store/StoreProvider";

const SIZES: { value: DumpReport["size"]; label: string }[] = [
  { value: "small", label: "A few bags" },
  { value: "medium", label: "A pile (car boot)" },
  { value: "large", label: "Lorry load" },
];

export const DUMP_TONE = { New: "bad", Assigned: "warn", Cleared: "ok" } as const;

/** Photograph and pin illegal dumping; it goes to the company serving that estate. */
export function ClientReport() {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { t } = useT();

  const [pin, setPin] = useState<LatLng | null>(null);
  const [size, setSize] = useState<DumpReport["size"]>("small");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const locate = async () => {
    setLocating(true);
    const p = await currentPosition();
    setLocating(false);
    if (p) setPin(p);
    else setError(t("Couldn't read your location. Tap the map where the dumping is instead."));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setError(t("Tap the map, or use your location, to show where it is."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const photoId = photo ? await uploadPhoto(photo) : undefined;
      const res = await actions.reportDump({ ...pin, description, size, photo: photoId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(`${t("Thank you.")} ${res.message ?? ""}`.trim());
      setPin(null);
      setDescription("");
      setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={t("Report illegal dumping")} icon={TriangleAlert}>
        {t("Show us where rubbish has been dumped. It goes to the company that serves the area.")}
      </PageHead>

      <div className="grid g-main">
        <Panel title={t("Where is it?")} icon={Crosshair}>
          <PinMap pin={pin} onPick={setPin} height={340} />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn small" onClick={locate} disabled={locating}>
              {locating ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Crosshair size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              {t("Use my location")}
            </button>
            <span className="hint">
              {pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : t("Or tap the map.")}
            </span>
          </div>

          <form className="stack" style={{ gap: 14, marginTop: 16 }} onSubmit={submit}>
            <div className="segmented" role="radiogroup" aria-label={t("How much")}>
              {SIZES.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  role="radio"
                  aria-checked={size === o.value}
                  onClick={() => setSize(o.value)}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
            <label className="f">
              {t("What was dumped?")}
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("e.g. Construction rubble and old mattresses by the stream")}
              />
            </label>
            <PhotoInput value={photo} onChange={setPhoto} label={t("Add a photo")} />
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              {busy ? (
                <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Send size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
              {t("Send report")}
            </button>
          </form>
        </Panel>

        <Panel title={t("Your reports")} icon={TriangleAlert}>
          {s.dumpReports.length === 0 ? (
            <Empty icon={TriangleAlert}>{t("You haven’t reported anything yet.")}</Empty>
          ) : (
            <div className="list">
              {s.dumpReports.map((r) => (
                <div className="li" key={r.id}>
                  <div>
                    <div className="t">{r.description}</div>
                    <div className="sub">
                      <span className="mono">{r.id}</span> ·{" "}
                      {r.estate ? estateName(r.estate) : t("Outside our estates")} ·{" "}
                      {fmtDate(r.createdAt)}
                    </div>
                  </div>
                  <Chip tone={DUMP_TONE[r.status]}>{t(r.status)}</Chip>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
