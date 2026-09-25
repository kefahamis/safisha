"use client";

import dynamic from "next/dynamic";
import { COMPANIES } from "@/lib/reference/companies";
import type { CityMapProps } from "./CityMapInner";

/**
 * Leaflet reaches for `window` at import time, so the map is loaded only in the
 * browser. The placeholder keeps the panel from collapsing while it arrives.
 */
export const CityMap = dynamic<CityMapProps>(() => import("./CityMapInner"), {
  ssr: false,
  loading: () => (
    <div className="mapwrap mapwrap-loading" style={{ height: 520 }}>
      <span className="hint">Loading map…</span>
    </div>
  ),
});

export function MapLegend() {
  return (
    <div className="legend">
      {COMPANIES.map((c) => (
        <span className="co" key={c.id}>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
        </span>
      ))}
      <span>● faded dot = paid up client</span>
      <span>● solid dot = balance due</span>
      <span>Dashed circle = service estate</span>
    </div>
  );
}
