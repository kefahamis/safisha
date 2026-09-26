"use client";

import { Check, CircleCheck, Image as ImageIcon, TriangleAlert, UserCheck } from "lucide-react";
import { useState } from "react";
import { PinMap } from "@/components/map/PinMap";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate } from "@/lib/format";
import { COMPANIES, companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import type { DumpReport } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

const TONE = { New: "bad", Assigned: "warn", Cleared: "ok" } as const;
const SIZE = { small: "A few bags", medium: "A pile", large: "Lorry load" } as const;

/** Illegal dumping reports on a map, for a company (its estates) or the platform. */
export function DumpingReports({ platform = false }: { platform?: boolean }) {
  const s = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const reports = s.dumpReports.filter((r) => filter === "all" || r.status !== "Cleared");

  return (
    <>
      <PageHead title="Dumping reports" icon={TriangleAlert}>
        Reported by residents with a photo and a map pin.{" "}
        {platform
          ? "Reports outside every company's estates land here unassigned."
          : "Reports in your estates, plus any your clients filed in another company's area."}
      </PageHead>

      <div className="segmented" role="radiogroup" aria-label="Show" style={{ alignSelf: "flex-start" }}>
        <button type="button" role="radio" aria-checked={filter === "open"} onClick={() => setFilter("open")}>
          Open
        </button>
        <button type="button" role="radio" aria-checked={filter === "all"} onClick={() => setFilter("all")}>
          All
        </button>
      </div>

      <div className="grid g-main">
        <div>
          <PinMap
            height={460}
            markers={reports.map((r) => ({
              id: r.id,
              lat: r.lat,
              lng: r.lng,
              tone: TONE[r.status],
              label: `${r.id} · ${r.status}`,
            }))}
            onSelect={setSelected}
          />
          <div className="legend">
            <span className="co">
              <span className="dot" style={{ background: "var(--bad)" }} /> New
            </span>
            <span className="co">
              <span className="dot" style={{ background: "var(--warn)" }} /> Assigned
            </span>
            <span className="co">
              <span className="dot" style={{ background: "var(--ok)" }} /> Cleared
            </span>
          </div>
        </div>
        <Panel title={`Reports · ${reports.length}`} icon={TriangleAlert}>
          {reports.length === 0 ? (
            <Empty icon={CircleCheck}>No open reports.</Empty>
          ) : (
            <div className="list">
              {reports.map((r) => (
                <ReportRow key={r.id} report={r} platform={platform} highlight={selected === r.id} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function ReportRow({ report: r, platform, highlight }: { report: DumpReport; platform: boolean; highlight: boolean }) {
  const s = useAppState();
  const actions = useActions();
  // Only the company serving the location (or the platform) can act on a report.
  const canAct = platform || r.company === s.companyId;
  const toast = useToast();
  const [company, setCompany] = useState(r.company ?? COMPANIES[0]?.id ?? "");

  const set = async (status: DumpReport["status"], assign?: string) => {
    const res = await actions.updateDump(r.id, status, assign);
    toast(res.ok ? `${r.id} marked ${status.toLowerCase()}` : res.error);
  };

  return (
    <div className={`li${highlight ? " highlight" : ""}`} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: "1 1 220px" }}>
        <div className="t">{r.description}</div>
        <div className="sub">
          <span className="mono">{r.id}</span> · {SIZE[r.size]} · {r.estate ? estateName(r.estate) : "No estate"} ·{" "}
          {fmtDate(r.createdAt)}
        </div>
        <div className="sub">
          {r.company ? companyById(r.company).name : "Unassigned"}
          {!canAct && " · reported by your client"}
        </div>
        {r.photo && (
          <a className="sub with-ico" href={`/api/files/${r.photo}`} target="_blank" rel="noreferrer">
            <ImageIcon size={13} strokeWidth={2.2} aria-hidden="true" />
            Photo
          </a>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Chip tone={TONE[r.status]}>{r.status}</Chip>
        {platform && !r.company && r.status !== "Cleared" && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company">
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {canAct && r.status === "New" && (
          <button
            type="button"
            className="btn small"
            onClick={() => set("Assigned", platform && !r.company ? company : undefined)}
          >
            <UserCheck size={14} strokeWidth={2.2} aria-hidden="true" />
            Assign crew
          </button>
        )}
        {canAct && r.status !== "Cleared" && (
          <button type="button" className="btn small primary" onClick={() => set("Cleared")}>
            <Check size={14} strokeWidth={2.2} aria-hidden="true" />
            Cleared
          </button>
        )}
      </div>
    </div>
  );
}
