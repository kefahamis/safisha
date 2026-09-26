"use client";

import { ClipboardCheck, CloudOff, FileBadge, Fuel, Medal, TriangleAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { addDays, currentDocuments, DOC_KINDS, driverScores, serviceDue } from "@/lib/fleet";
import { fmtDate, group, kes } from "@/lib/format";
import { truckById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";
import { lastReading } from "../fleet/FleetCenter";
import { AlertList, CheckChip, DocChip, ScoreBar, ServiceChip, VehicleStateChip } from "../fleet/FleetBits";
import { CheckForm, FuelForm, IncidentForm } from "../fleet/FleetForms";
import { useFleet } from "../fleet/useFleet";

type Sheet = "check" | "fuel" | "incident" | null;

/** The driver's side of fleet management: the daily check, fuel, incidents and their truck's papers. */
export function CollectorVehicle() {
  const s = useAppState();
  const toast = useToast();
  const truck = truckById(s, s.truckId);
  const { data, load } = useFleet(truck?.company ?? "", truck?.id);
  const [sheet, setSheet] = useState<Sheet>(null);

  if (!truck) {
    return (
      <>
        <PageHead title="My truck" icon={Wrench} />
        <Empty icon={Wrench}>You don&rsquo;t have a truck assigned. Ask the fleet office.</Empty>
      </>
    );
  }

  const check = s.fleet.checks[truck.id];
  const vehicle = data?.vehicles.find((v) => v.truck === truck.id);
  const last = data ? lastReading(data, truck.id) : 0;
  const done = (res: { ok: boolean; message?: string }) => {
    setSheet(null);
    if (res.ok) toast(res.message ?? "Saved");
    void load();
  };
  const docs = data ? currentDocuments(data.documents) : [];
  const from = data ? addDays(data.today, -29) : "";
  const score = data
    ? driverScores(
        data.days.filter((d) => d.day >= from && d.driver === truck.driver),
        data.inspections.filter((i) => i.at.slice(0, 10) >= from),
        data.incidents.filter((i) => i.at.slice(0, 10) >= from),
        { [truck.driver]: truck.id },
      ).find((x) => x.driver === truck.driver)
    : undefined;
  const fills = data?.fuel.slice(0, 4) ?? [];

  return (
    <>
      <PageHead title="My truck" icon={Wrench} actions={vehicle ? <VehicleStateChip state={vehicle.state} /> : undefined}>
        <span className="mono">{truck.id}</span>
        {vehicle ? ` · ${vehicle.make} ${vehicle.model}` : ""} · {truck.driver}
      </PageHead>

      {vehicle?.state === "off_road" && (
        <div className="banner bad">
          <TriangleAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          This truck has a safety-critical defect. Don&rsquo;t drive it until the workshop clears it.
        </div>
      )}

      <div className={`panel check-hero${check ? " done" : ""}`}>
        <div>
          <div className="label">Start-of-day check</div>
          <div className="check-hero-status">
            {check ? (
              check.result === "pass" ? (
                "Done. Safe to drive."
              ) : (
                <>Done, with defects: {check.defects.join(", ")}</>
              )
            ) : (
              "Not done yet today"
            )}
          </div>
          {check && <CheckChip check={check} />}
        </div>
        <button type="button" className={`btn ${check ? "" : "primary"}`} onClick={() => setSheet("check")}>
          <ClipboardCheck size={17} strokeWidth={2.2} aria-hidden="true" />
          {check ? "Check again" : "Start check"}
        </button>
      </div>

      <div className="row fleet-driver-actions">
        <button type="button" className="btn" onClick={() => setSheet("fuel")}>
          <Fuel size={16} strokeWidth={2.2} aria-hidden="true" />
          Log fuel
        </button>
        <button type="button" className="btn" onClick={() => setSheet("incident")}>
          <TriangleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
          Report an incident
        </button>
        {s.pending > 0 && (
          <Chip tone="warn" icon={CloudOff}>
            {s.pending} waiting to sync
          </Chip>
        )}
      </div>

      {s.fleet.alerts.length > 0 && (
        <Panel title="Needs attention" icon={TriangleAlert}>
          <AlertList alerts={s.fleet.alerts} />
        </Panel>
      )}

      <div className="grid g2">
        <Panel title="Service and papers" icon={FileBadge}>
          {vehicle && data ? (
            <div className="list">
              <div className="li">
                <div>
                  <div className="t">Next service</div>
                  <div className="sub">
                    At {group(serviceDue(vehicle, data.today).dueKm)} km or {fmtDate(serviceDue(vehicle, data.today).dueDate)}
                  </div>
                </div>
                <ServiceChip vehicle={vehicle} today={data.today} />
              </div>
              {DOC_KINDS.map((k) => {
                const subject = k.subject === "vehicle" ? truck.id : data.drivers.find((d) => d.truck === truck.id)?.id;
                const d = docs.find((x) => x.kind === k.key && x.subject === subject);
                return (
                  <div className="li" key={k.key}>
                    <div>
                      <div className="t">{k.label}</div>
                      <div className="sub">{d ? `To ${fmtDate(d.expiresOn)}` : "Not on file with the office"}</div>
                    </div>
                    {d ? <DocChip expiresOn={d.expiresOn} today={data.today} /> : <Chip tone="warn">Missing</Chip>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="hint">Loads when you&rsquo;re online.</p>
          )}
        </Panel>

        <div className="stack">
          <Panel title="My driving · 30 days" icon={Medal}>
            {score ? (
              <>
                <ScoreBar score={score.score} />
                <p className="hint" style={{ marginTop: 8 }}>
                  {group(score.km)} km over {score.days} days · {score.checksDone} of {score.days} checks done
                </p>
                {score.penalties.length > 0 ? (
                  <div className="list">
                    {score.penalties.map((p) => (
                      <div className="li" key={p.label}>
                        <span>{p.label}</span>
                        <span className="num bad-text">−{p.points}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint">A clean month. Keep it up.</p>
                )}
              </>
            ) : (
              <p className="hint">{data ? "No driving recorded yet." : "Loads when you're online."}</p>
            )}
          </Panel>

          <Panel title="Recent fills" icon={Fuel}>
            {fills.length ? (
              <div className="list">
                {fills.map((f) => (
                  <div className="li" key={f.id}>
                    <div>
                      <div className="t num">
                        {f.litres} L · {kes(f.amount)}
                      </div>
                      <div className="sub">
                        {fmtDate(f.at)} · {group(f.odometerKm)} km
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">{data ? "No fuel logged yet." : "Loads when you're online."}</p>
            )}
          </Panel>
        </div>
      </div>

      {sheet === "check" && <CheckForm truck={truck.id} lastOdometer={last} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === "fuel" && <FuelForm truck={truck.id} lastOdometer={last} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === "incident" && <IncidentForm truck={truck.id} onClose={() => setSheet(null)} onDone={done} />}
    </>
  );
}
