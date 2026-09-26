"use client";

import { Clock, Gauge, LoaderCircle, MapPinned, MoonStar, Pause, Play, Route, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Kpi, Panel } from "@/components/ui/Panel";
import type { TrackMapProps } from "@/components/map/TrackMapInner";
import { EVENT_LABEL, type FleetBundle, type FleetEvent, type TrackDay } from "@/lib/fleet";
import { fmtDate } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";

const TrackMap = dynamic<TrackMapProps>(() => import("@/components/map/TrackMapInner"), {
  ssr: false,
  loading: () => (
    <div className="mapwrap mapwrap-loading" style={{ height: 460 }}>
      <span className="hint with-ico">
        <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
        Loading map…
      </span>
    </div>
  ),
});

const EVENT_ICON: Partial<Record<FleetEvent["kind"], typeof Gauge>> = {
  speeding: Gauge,
  idle: Clock,
  after_hours: MoonStar,
  zone_enter: MapPinned,
  zone_exit: Route,
};

/** "HH:mm" in Nairobi for an epoch. */
const clock = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(11, 16);

const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);

export function FleetTrips({ data }: { data: FleetBundle }) {
  const [truck, setTruck] = useState(data.vehicles.find((v) => v.state === "active")?.truck ?? data.vehicles[0]?.truck ?? "");
  const [day, setDay] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [track, setTrack] = useState<TrackDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(
    async (plate: string, which: string) => {
      setLoading(true);
      setPlaying(false);
      const qs = new URLSearchParams({ truck: plate, ...(which ? { day: which } : {}) });
      const res = await fetch(`/api/fleet/${data.company}/track?${qs}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setDays(body.days ?? []);
      setTrack(body.track ?? null);
      setDay(body.track?.day ?? "");
      setCursor(body.track ? Math.max(0, body.track.pings.length - 1) : 0);
    },
    [data.company],
  );

  useEffect(() => {
    void load(truck, "");
  }, [truck, load]);

  // Replay at about ten minutes of driving a second.
  useEffect(() => {
    if (!playing || !track) return;
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= track.pings.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 100);
    return () => window.clearInterval(timer.current);
  }, [playing, track]);

  const play = () => {
    if (!track) return;
    if (cursor >= track.pings.length - 1) setCursor(0);
    setPlaying((p) => !p);
  };

  const jumpTo = (at: number) => {
    if (!track) return;
    let best = 0;
    for (let i = 0; i < track.pings.length; i++) if (track.pings[i].at <= at) best = i;
    setPlaying(false);
    setCursor(best);
  };

  const here = track?.pings[cursor];
  const sum = track?.summary;
  const events = (track?.events ?? []).filter((e) => e.kind !== "zone_exit" || e.zone === "Dandora dumpsite");
  const color = companyById(data.company).color;

  return (
    <>
      <Panel>
        <div className="row fleet-trip-pick">
          <label className="f">
            Truck
            <select value={truck} onChange={(e) => setTruck(e.target.value)}>
              {data.vehicles.map((v) => (
                <option key={v.truck} value={v.truck}>
                  {v.truck} · {v.driver}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Day
            <select value={day} onChange={(e) => void load(truck, e.target.value)} disabled={!days.length}>
              {!days.length && <option value="">No GPS recorded</option>}
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDate(d)}
                </option>
              ))}
            </select>
          </label>
          {loading && <LoaderCircle size={18} strokeWidth={2.2} className="spin" aria-label="Loading" />}
        </div>
      </Panel>

      {!track || !track.pings.length ? (
        <Panel>
          <Empty icon={MapPinned}>
            {loading
              ? "Loading the track…"
              : "No GPS history for this truck yet. Tracks are recorded while the driver shares the phone's GPS from the collector app."}
          </Empty>
        </Panel>
      ) : (
        <>
          {sum && (
            <div className="kpis">
              <Kpi label="Distance" value={`${sum.km.toFixed(1)} km`} sub={`${clock(track.pings[0].at)}–${clock(track.pings[track.pings.length - 1].at)}`} icon={Route} />
              <Kpi label="Driving" value={hours(sum.movingMin)} sub={`Top speed ${sum.maxKmh} km/h`} icon={Gauge} iconTone="sky" />
              <Kpi label="Idling" value={hours(sum.idleMin)} sub={`Stands over ${data.settings.idleMinutes} min away from yard and dumpsite`} icon={Clock} iconTone="warn" />
              <Kpi label="Dumpsite runs" value={String(sum.dumpRuns)} sub={`${sum.speeding} speeding · ${sum.afterHours} after hours`} icon={Trash2} iconTone="violet" />
            </div>
          )}

          <div className="grid g-main">
            <div>
              <TrackMap track={track} cursor={cursor} color={color} />
              <div className="trip-scrub">
                <button type="button" className="btn small primary icon-only" onClick={play} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause size={15} strokeWidth={2.4} aria-hidden="true" /> : <Play size={15} strokeWidth={2.4} aria-hidden="true" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={track.pings.length - 1}
                  value={cursor}
                  onChange={(e) => {
                    setPlaying(false);
                    setCursor(Number(e.target.value));
                  }}
                  aria-label="Replay position"
                />
                <span className="num trip-clock">
                  {here ? clock(here.at) : ""}
                  {here?.kmh !== undefined && <span className="hint"> · {Math.round(here.kmh)} km/h</span>}
                </span>
              </div>
            </div>

            <Panel title="Timeline" icon={Clock}>
              {events.length ? (
                <div className="list trip-events">
                  {events.map((e) => {
                    const Icon = EVENT_ICON[e.kind] ?? MapPinned;
                    const alert = e.kind === "speeding" || e.kind === "idle" || e.kind === "after_hours";
                    return (
                      <button key={`${e.kind}-${e.at}`} type="button" className={`li${alert ? " alert" : ""}`} onClick={() => jumpTo(e.at)}>
                        <span className="num trip-time">{clock(e.at)}</span>
                        <span className="with-ico">
                          <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
                          {EVENT_LABEL[e.kind]}
                          {e.zone ? ` ${e.kind === "zone_enter" ? "at" : ""} ${e.zone}` : ""}
                          {e.kind === "speeding" && e.value ? ` · ${e.value} km/h` : ""}
                          {e.kind === "idle" && e.value ? ` · ${e.value} min` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="hint">No events on this day.</p>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
