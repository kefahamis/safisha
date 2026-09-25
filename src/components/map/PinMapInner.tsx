"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { NAIROBI_CENTRE } from "@/lib/reference/estates";
import type { LatLng } from "@/lib/types";
import { useColorScheme } from "./useColorScheme";

import "leaflet/dist/leaflet.css";

export interface PinMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Status tone: bad (new), warn (assigned), ok (cleared). */
  tone: "bad" | "warn" | "ok";
}

export interface PinMapProps {
  /** Where the user has dropped a pin, if anywhere. */
  pin?: LatLng | null;
  /** Called with the tapped point, making the map a location picker. */
  onPick?: (p: LatLng) => void;
  markers?: PinMarker[];
  onSelect?: (id: string) => void;
  height?: number;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const TONE = { bad: "var(--bad)", warn: "var(--warn)", ok: "var(--ok)" } as const;

function Picker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Pans to the pin when it moves (e.g. after "Use my location"). */
function Follow({ pin }: { pin?: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 15));
  }, [pin, map]);
  return null;
}

/** A map for dropping a pin, or for showing reported points by status. */
export default function PinMapInner({ pin, onPick, markers = [], onSelect, height = 360 }: PinMapProps) {
  const scheme = useColorScheme();
  const centre = pin ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : NAIROBI_CENTRE);

  return (
    <div className={`mapwrap${onPick ? " picking" : ""}`} style={{ height }}>
      <MapContainer
        center={[centre.lat, centre.lng]}
        zoom={pin || markers.length ? 13 : 11}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} className={`basemap basemap-${scheme}`} />
        {onPick && <Picker onPick={onPick} />}
        <Follow pin={pin} />
        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: TONE[m.tone], fillOpacity: 1 }}
            eventHandlers={onSelect ? { click: () => onSelect(m.id) } : undefined}
          >
            <Tooltip>{m.label}</Tooltip>
          </CircleMarker>
        ))}
        {pin && (
          <CircleMarker
            center={[pin.lat, pin.lng]}
            radius={10}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "var(--vis)", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              Here
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
