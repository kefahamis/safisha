"use client";

import { CircleCheck, FileBadge, Plus, Siren } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, Panel } from "@/components/ui/Panel";
import type { CommandResult } from "@/lib/commands";
import { currentDocuments, docLabel, docStatus, incidentLabel, type FleetBundle, type Incident } from "@/lib/fleet";
import { fmtDate, kes } from "@/lib/format";
import { useActions } from "@/store/StoreProvider";
import { DocChip } from "./FleetBits";
import { FormSheet } from "./FleetForms";
import type { DocumentDraft } from "./OfficeForms";

type Run = (pending: Promise<CommandResult>, done?: () => void) => Promise<CommandResult>;

export function FleetCompliance({ data, run, onDocument }: { data: FleetBundle; run: Run; onDocument: (draft?: DocumentDraft) => void }) {
  const [onlyDue, setOnlyDue] = useState(true);
  const [closing, setClosing] = useState<Incident | null>(null);
  const docs = currentDocuments(data.documents)
    .filter((d) => d.subjectType === "driver" || data.vehicles.some((v) => v.truck === d.subject))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  const due = docs.filter((d) => docStatus(d.expiresOn, data.today).status !== "valid");
  const shown = onlyDue ? due : docs;

  return (
    <>
      <Panel
        title="Papers"
        icon={FileBadge}
        aside={
          <div className="row" style={{ gap: 8 }}>
            <div className="segmented" role="radiogroup" aria-label="Show">
              <button type="button" role="radio" aria-checked={onlyDue} onClick={() => setOnlyDue(true)}>
                To renew ({due.length})
              </button>
              <button type="button" role="radio" aria-checked={!onlyDue} onClick={() => setOnlyDue(false)}>
                All ({docs.length})
              </button>
            </div>
            <button type="button" className="btn small primary" onClick={() => onDocument()}>
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              Record
            </button>
          </div>
        }
      >
        <p className="hint" style={{ marginTop: -4 }}>
          Insurance, NTSA inspection, NEMA waste transport licence and county permit for every truck; driving licence and
          certificate of good conduct for every driver. Flagged 30 days before they run out.
        </p>
        {shown.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>For</th>
                  <th>Document</th>
                  <th>Number</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  <th className="r">Last cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <td className={d.subjectType === "vehicle" ? "mono" : undefined}>{d.subjectName}</td>
                    <td>{docLabel(d.kind)}</td>
                    <td className="mono">{d.number || <span className="hint">—</span>}</td>
                    <td>{fmtDate(d.expiresOn)}</td>
                    <td>
                      <DocChip expiresOn={d.expiresOn} today={data.today} />
                    </td>
                    <td className="r num">{d.cost ? kes(d.cost) : "—"}</td>
                    <td className="r">
                      <button type="button" className="btn small ghost" onClick={() => onDocument({ subjectType: d.subjectType, subject: d.subject, kind: d.kind })}>
                        Renew
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={CircleCheck}>Nothing runs out in the next 30 days.</Empty>
        )}
      </Panel>

      <Panel title="Incidents" icon={Siren}>
        {data.incidents.length ? (
          <div className="list">
            {data.incidents.map((x) => (
              <div className="li" key={x.id}>
                <div>
                  <div className="t">
                    {incidentLabel(x.kind)} · <span className="mono">{x.truck}</span>
                  </div>
                  <div className="sub">{x.description}</div>
                  <div className="sub">
                    <span className="mono">{x.id}</span> · {fmtDate(x.at)} · {x.driver}
                    {x.policeRef ? ` · ${x.policeRef}` : ""}
                    {x.photo && (
                      <>
                        {" · "}
                        <a href={`/api/files/${x.photo}`} target="_blank" rel="noreferrer">
                          Photo
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="r" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <div className="row" style={{ gap: 6 }}>
                    {x.severity === "major" && <Chip tone="bad">Major</Chip>}
                    <Chip tone={x.status === "open" ? "warn" : "ok"}>{x.status === "open" ? "Open" : "Closed"}</Chip>
                  </div>
                  {x.status === "open" ? (
                    <button type="button" className="btn small ghost" onClick={() => setClosing(x)}>
                      Close
                    </button>
                  ) : (
                    x.cost > 0 && <span className="hint num">Cost {kes(x.cost)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Siren}>No incidents reported.</Empty>
        )}
      </Panel>

      {closing && <CloseIncident incident={closing} run={run} onClose={() => setClosing(null)} />}
    </>
  );
}

function CloseIncident({ incident, run, onClose }: { incident: Incident; run: Run; onClose: () => void }) {
  const actions = useActions();
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    const n = cost.trim() ? Number(cost.replace(/,/g, "")) : 0;
    if (!(n >= 0)) return setError("Enter the cost, or leave it blank.");
    const res = await run(actions.closeIncident(incident.id, Math.round(n)), onClose);
    if (!res.ok) setError(res.error);
  };
  return (
    <FormSheet
      title={`Close ${incident.id}`}
      icon={<Siren size={19} strokeWidth={2.2} aria-hidden="true" />}
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Close incident
          </button>
        </>
      }
    >
      <p className="hint">
        {incidentLabel(incident.kind)} on {fmtDate(incident.at)}. Record what it cost the company (fines, excess, towing) for the
        record. Repairs go through a work order so they reach the books.
      </p>
      <label className="f" style={{ marginTop: 12 }}>
        Cost to the company (KES)
        <input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
      </label>
    </FormSheet>
  );
}
