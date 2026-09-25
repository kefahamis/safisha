"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { truckPos } from "@/lib/geo";
import { companyById, companyForEstate } from "@/lib/reference/companies";
import { ESTATES, NAIROBI_CENTRE } from "@/lib/reference/estates";
import { balance, clientById } from "@/lib/selectors";
import type { LatLng } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";
import { useColorScheme } from "./useColorScheme";

import "leaflet/dist/leaflet.css";

export interface CityMapProps {
  /** Limits trucks and clients to one company and highlights its estates. */
  companyId?: string;
  /** Client whose gate is pinned. */
  homeClientId?: string;
  showClients?: boolean;
  focusTruckId?: string;
  height?: number;
}

/**
 * OpenStreetMap's standard raster tiles: free, no API key, no sign-up. Their
 * usage policy covers development and light traffic like this prototype — a
 * production deployment should self-host or use a paid tile provider.
 *
 * OSM ships one (light) style, so the dark theme recolours it in CSS rather
 * than pulling a second, key-gated basemap.
 */
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** A truck: coloured body plus its number plate, drawn as HTML. */
function truckIcon(color: string, plate: string, offline: boolean, focused: boolean) {
  return L.divIcon({
    className: "truck-icon",
    html: `<span class="truck-dot${focused ? " focused" : ""}${offline ? " offline" : ""}" style="--truck:${color}"></span><span class="truck-plate">${plate}</span>`,
    iconSize: [64, 34],
    iconAnchor: [32, 12],
  });
}

const homeIcon = L.divIcon({
  className: "home-icon",
  html: '<span class="home-pin"></span><span class="home-label">Your gate</span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/** Frames the map on whatever is being shown, once, on first render. */
function FitBounds({ points, fallbackZoom }: { points: LatLng[]; fallbackZoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView([NAIROBI_CENTRE.lat, NAIROBI_CENTRE.lng], fallbackZoom);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.18),
    );
    // Deliberately first-render only: refitting on every tick would fight the
    // user's own panning as the trucks move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function CityMapInner({
  companyId = "",
  homeClientId,
  showClients = true,
  focusTruckId,
  height = 520,
}: CityMapProps) {
  const s = useAppState();
  const scheme = useColorScheme();

  const covered = companyId ? companyById(companyId).estates : Object.keys(ESTATES);
  const home = homeClientId ? clientById(s, homeClientId) : undefined;

  const clients = s.clients.filter(
    (c) => (!companyId || c.company === companyId) && c.id !== homeClientId,
  );
  const trucks = s.trucks.filter((t) => !companyId || t.company === companyId);

  // Frame on the service area, so a single-company map isn't showing empty city.
  const framePoints = useMemo<LatLng[]>(() => {
    const points = covered.map((code) => ({ lat: ESTATES[code].lat, lng: ESTATES[code].lng }));
    if (home) points.push({ lat: home.lat, lng: home.lng });
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mapwrap" style={{ height }}>
      <MapContainer
        center={[NAIROBI_CENTRE.lat, NAIROBI_CENTRE.lng]}
        zoom={11}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={TILE_URL}
          attribution={ATTRIBUTION}
          maxZoom={19}
          className={`basemap basemap-${scheme}`}
        />
        <FitBounds points={framePoints} fallbackZoom={11} />

        {Object.entries(ESTATES).map(([code, e]) => {
          const served = !companyId || covered.includes(code);
          const owner = companyForEstate(code);
          const color = served && owner ? owner.color : "#8A94A6";
          return (
            <Circle
              key={code}
              center={[e.lat, e.lng]}
              radius={e.radius}
              pathOptions={{
                color,
                weight: served ? 2 : 1,
                opacity: served ? 0.75 : 0.3,
                fillColor: color,
                fillOpacity: served ? 0.1 : 0.04,
                dashArray: served ? "5 5" : undefined,
              }}
            >
              <Tooltip direction="center" permanent className="estate-label">
                {e.name}
              </Tooltip>
            </Circle>
          );
        })}

        {showClients &&
          clients.map((c) => {
            const owed = balance(s, c.id) > 0;
            return (
              <CircleMarker
                key={c.id}
                center={[c.lat, c.lng]}
                radius={5}
                pathOptions={{
                  color: "#fff",
                  weight: 1.5,
                  fillColor: companyById(c.company).color,
                  fillOpacity: owed ? 1 : 0.5,
                }}
              >
                <Tooltip>
                  {c.name} · {c.id}
                </Tooltip>
              </CircleMarker>
            );
          })}

        {/* Lifted above the trucks — the client's own gate should never be hidden. */}
        {home && (
          <Marker position={[home.lat, home.lng]} icon={homeIcon} zIndexOffset={1000} />
        )}

        {trucks.map((t) => {
          const p = truckPos(t);
          const offline = t.status === "offline";
          return (
            <Marker
              key={t.id}
              position={[p.lat, p.lng]}
              icon={truckIcon(
                offline ? "#8A94A6" : companyById(t.company).color,
                t.id,
                offline,
                focusTruckId === t.id,
              )}
            >
              <Tooltip>
                {t.id} · {t.driver}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

