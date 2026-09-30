"use client";

import { LoaderCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { COMPANIES, companyById } from "@/lib/reference/companies";
import type { CityMapProps } from "./CityMapInner";

/**
 * Leaflet reaches for `window` at import time, so the map is loaded only in the
 * browser. The placeholder keeps the panel from collapsing while it arrives.
 */
export const CityMap = dynamic<CityMapProps>(() => import("./CityMapInner"), {
  ssr: false,
  loading: () => (
    <div className="mapwrap mapwrap-loading" style={{ height: 520 }}>
      <span className="hint with-ico">
        <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
        Loading map…
      </span>
    </div>
  ),
});

/** With `companyId`, the legend names only that company; without it, every company. */
export function MapLegend({ companyId }: { companyId?: string }) {
  const companies = companyId ? [companyById(companyId)] : COMPANIES;
  return (
    <div className="legend">
      {companies.map((c) => (
        <span className="co" key={c.id}>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
        </span>
      ))}
      <span className="co">
        <span className="dot faded" /> Paid-up client
      </span>
      <span className="co">
        <span className="dot solid" /> Balance due
      </span>
      <span className="co">
        <span className="ring" /> Service estate
      </span>
    </div>
  );
}
