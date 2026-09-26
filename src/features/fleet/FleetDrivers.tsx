"use client";

import { Clock, Gauge, Medal, MoonStar, UserRound } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, Panel } from "@/components/ui/Panel";
import type { CommandResult } from "@/lib/commands";
import { addDays, currentDocuments, driverScores, EVENT_LABEL, type FleetBundle } from "@/lib/fleet";
import { group } from "@/lib/format";
import { useActions } from "@/store/StoreProvider";
import { DocChip, ScoreBar } from "./FleetBits";

type Run = (pending: Promise<CommandResult>, done?: () => void) => Promise<CommandResult>;

const EVENT_ICON = { speeding: Gauge, idle: Clock, after_hours: MoonStar } as const;

const eventTime = (ms: number) => {
  const d = new Date(ms + 3 * 3_600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};

export function FleetDrivers({ data, run }: { data: FleetBundle; run: Run }) {
  const actions = useActions();
  const from = addDays(data.today, -29);
  const days = data.days.filter((d) => d.day >= from);
  const assigned = Object.fromEntries(data.vehicles.map((v) => [v.driver, v.truck]));
  const scores = driverScores(
    days,
    data.inspections.filter((i) => i.at.slice(0, 10) >= from),
    data.incidents.filter((i) => i.at.slice(0, 10) >= from),
    assigned,
  );
  const docs = currentDocuments(data.documents).filter((d) => d.subjectType === "driver");
  const [allEvents, setAllEvents] = useState(false);
  const events = allEvents ? data.events : data.events.slice(0, 12);

  const assign = (driverId: string, truck: string) => {
    const name = data.drivers.find((d) => d.id === driverId)?.name;
    const current = data.vehicles.find((v) => v.truck === truck)?.driver;
    if (!window.confirm(`Put ${name} on ${truck}?${current && current !== name ? ` ${current} will swap onto ${name}'s truck.` : ""}`)) return;
    void run(actions.assignDriver(truck, driverId));
  };

  return (
    <>
      <Panel title="Driver scorecards · 30 days" icon={Medal}>
        <p className="hint" style={{ marginTop: -4 }}>
          Out of 100. Points come off for speeding over {data.settings.speedLimitKmh} km/h and idling (both per 100 km driven), moving outside{" "}
          {data.settings.dayStart}–{data.settings.dayEnd}, skipped daily checks, and accidents or traffic offences.
        </p>
        {scores.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Driver</th>
                  <th>Score</th>
                  <th className="r">km</th>
                  <th className="r">Speeding</th>
                  <th className="r">Idle</th>
                  <th className="r">After hours</th>
                  <th className="r">Checks</th>
                  <th className="r">Incidents</th>
                  <th>Truck</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((sc, i) => {
                  const user = data.drivers.find((d) => d.name === sc.driver);
                  return (
                    <tr key={sc.driver}>
                      <td className="num">{i + 1}</td>
                      <td className="wrap">
                        <div className="t">{sc.driver}</div>
                        {sc.penalties.length > 0 && (
                          <div className="hint">{sc.penalties.map((p) => `${p.label} −${p.points}`).join(" · ")}</div>
                        )}
                      </td>
                      <td>
                        <ScoreBar score={sc.score} />
                      </td>
                      <td className="r num">{group(sc.km)}</td>
                      <td className="r num">{sc.speeding}</td>
                      <td className="r num">{sc.idleMin} min</td>
                      <td className="r num">{sc.afterHours}</td>
                      <td className="r num">
                        {sc.checksDone}/{sc.days}
                      </td>
                      <td className="r num">{sc.incidents}</td>
                      <td>
                        {user ? (
                          <select
                            aria-label={`Truck for ${sc.driver}`}
                            className="compact"
                            value={user.truck ?? ""}
                            onChange={(e) => e.target.value && assign(user.id, e.target.value)}
                          >
                            {!user.truck && <option value="">No truck</option>}
                            {data.vehicles.map((v) => (
                              <option key={v.truck} value={v.truck}>
                                {v.truck}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="mono">{sc.truck ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={UserRound}>No driving recorded in the last 30 days.</Empty>
        )}
      </Panel>

      <div className="grid g2">
        <Panel title="Driver papers" icon={UserRound}>
          <div className="list">
            {data.drivers.map((d) => {
              const licence = docs.find((x) => x.subject === d.id && x.kind === "licence");
              const conduct = docs.find((x) => x.subject === d.id && x.kind === "conduct");
              return (
                <div className="li" key={d.id}>
                  <div>
                    <div className="t">{d.name}</div>
                    <div className="sub">
                      {d.truck ? <span className="mono">{d.truck}</span> : "No truck"} · licence {licence ? `to ${licence.expiresOn}` : "not on file"}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {licence ? <DocChip expiresOn={licence.expiresOn} today={data.today} /> : <Chip tone="bad">No licence</Chip>}
                    {!conduct && <Chip tone="warn">No good conduct</Chip>}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Driving events · 30 days" icon={Gauge}>
          {events.length ? (
            <div className="list">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.kind as keyof typeof EVENT_ICON] ?? Gauge;
                return (
                  <div className="li" key={e.id}>
                    <div className="with-ico">
                      <span className={`itile sm ${e.kind === "after_hours" ? "bad" : "warn"}`} aria-hidden="true">
                        <Icon size={14} strokeWidth={2} />
                      </span>
                      <div>
                        <div className="t">
                          {EVENT_LABEL[e.kind]}
                          {e.kind === "speeding" && e.value ? ` · ${e.value} km/h` : ""}
                          {e.kind === "idle" && e.value ? ` · ${e.value} min` : ""}
                        </div>
                        <div className="sub">
                          {e.driver} · <span className="mono">{e.truck}</span>
                          {e.zone ? ` · ${e.zone}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="hint num">{eventTime(e.at)}</span>
                  </div>
                );
              })}
              {data.events.length > 12 && (
                <button type="button" className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setAllEvents((x) => !x)}>
                  {allEvents ? "Show fewer" : `Show all ${data.events.length}`}
                </button>
              )}
            </div>
          ) : (
            <Empty icon={Gauge}>No speeding, idling or after-hours movement recorded.</Empty>
          )}
        </Panel>
      </div>
    </>
  );
}
