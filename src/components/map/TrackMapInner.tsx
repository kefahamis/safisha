"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { EVENT_LABEL, type TrackDay } from "@/lib/fleet";
import { NAIROBI_CENTRE } from "@/lib/reference/estates";
import { useColorScheme } from "./useColorScheme";

import "leaflet/dist/leaflet.css";

export interface TrackMapProps {
  track: TrackDay;
  /** Index into the pings: the replay position. */
  cursor: number;
  color: string;
  height?: number;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const EVENT_COLOR: Record<string, string> = {
  speeding: "#E0662F",
  idle: "#C99A06",
  after_hours: "#C8323C",
};

/** Frames the whole day each time a different track loads. */
function Fit({ track }: { track: TrackDay }) {
  const map = useMap();
  useEffect(() => {
    if (!track.pings.length) {
      map.setView([NAIROBI_CENTRE.lat, NAIROBI_CENTRE.lng], 11);
      return;
    }
    map.fitBounds(L.latLngBounds(track.pings.map((p) => [p.lat, p.lng] as [number, number])).pad(0.12));
  }, [map, track]);
  return null;
}

export default function TrackMapInner({ track, cursor, color, height = 460 }: TrackMapProps) {
  const scheme = useColorScheme();
  const path = useMemo(() => track.pings.map((p) => [p.lat, p.lng] as [number, number]), [track]);
  const done = path.slice(0, cursor + 1);
  const here = track.pings[Math.min(cursor, track.pings.length - 1)];
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "truck-icon",
        html: `<span class="truck-dot focused" style="--truck:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    [color],
  );

  return (
    <div className="mapwrap" style={{ height }}>
      <MapContainer center={[NAIROBI_CENTRE.lat, NAIROBI_CENTRE.lng]} zoom={11} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} className={`basemap basemap-${scheme}`} />
        <Fit track={track} />

        {track.zones
          .filter((z) => z.kind !== "estate")
          .map((z) => (
            <Circle
              key={z.id}
              center={[z.lat, z.lng]}
              radius={z.radius}
              pathOptions={{ color: z.kind === "dumpsite" ? "#8B5E34" : "#4B6B63", weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }}
            >
              <Tooltip direction="top">{z.name}</Tooltip>
            </Circle>
          ))}

        <Polyline positions={path} pathOptions={{ color: "#8AA39B", weight: 4, opacity: 0.45 }} />
        <Polyline positions={done} pathOptions={{ color, weight: 4.5, opacity: 0.95 }} />

        {track.events
          .filter((e) => e.kind in EVENT_COLOR)
          .map((e) => (
            <CircleMarker
              key={`${e.kind}-${e.at}`}
              center={[e.lat, e.lng]}
              radius={7}
              pathOptions={{ color: "#fff", weight: 2, fillColor: EVENT_COLOR[e.kind], fillOpacity: 1 }}
            >
              <Tooltip>
                {EVENT_LABEL[e.kind]}
                {e.kind === "speeding" && e.value ? ` · ${e.value} km/h` : ""}
                {e.kind === "idle" && e.value ? ` · ${e.value} min` : ""}
              </Tooltip>
            </CircleMarker>
          ))}

        {here && <Marker position={[here.lat, here.lng]} icon={icon} zIndexOffset={1000} />}
      </MapContainer>
    </div>
  );
}
