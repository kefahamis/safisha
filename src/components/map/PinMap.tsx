"use client";

import dynamic from "next/dynamic";
import type { PinMapProps } from "./PinMapInner";

/** Leaflet needs `window`, so the map loads in the browser only. */
export const PinMap = dynamic<PinMapProps>(() => import("./PinMapInner"), {
  ssr: false,
  loading: () => (
    <div className="mapwrap mapwrap-loading" style={{ height: 360 }}>
      <span className="hint">Loading map…</span>
    </div>
  ),
});
