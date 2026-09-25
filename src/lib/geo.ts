import { ESTATES } from "./reference/estates";
import type { Client, LatLng, Truck } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Position along the truck's looping route, derived from distance travelled.
 * Segments are interpolated linearly in degrees: Nairobi sits within 1.4° of the
 * equator, where a degree of longitude is within 0.03% of a degree of latitude,
 * so the error over a few kilometres is far below map resolution.
 */
export function truckPos(t: Truck): LatLng {
  const pts = t.route.map((code) => ESTATES[code]);
  if (pts.length === 0) return { lat: 0, lng: 0 };
  if (pts.length < 2) return { lat: pts[0].lat, lng: pts[0].lng };

  const segs: { a: LatLng; b: LatLng; length: number }[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = { lat: pts[i].lat, lng: pts[i].lng };
    const next = pts[(i + 1) % pts.length];
    const b = { lat: next.lat, lng: next.lng };
    const length = distanceMeters(a, b);
    segs.push({ a, b, length });
    total += length;
  }
  if (total === 0) return { lat: pts[0].lat, lng: pts[0].lng };

  let d = ((t.d % total) + total) % total;
  for (const s of segs) {
    if (d <= s.length) {
      const f = s.length === 0 ? 0 : d / s.length;
      return {
        lat: s.a.lat + (s.b.lat - s.a.lat) * f,
        lng: s.a.lng + (s.b.lng - s.a.lng) * f,
      };
    }
    d -= s.length;
  }
  return { lat: pts[0].lat, lng: pts[0].lng };
}

/** Average speed through Nairobi traffic, for the client-facing ETA. */
const ETA_KMH = 15;

export function etaMin(t: Truck, c: Client): number {
  const km = distanceMeters(truckPos(t), { lat: c.lat, lng: c.lng }) / 1000;
  return Math.max(2, Math.round((km / ETA_KMH) * 60));
}

/** Display form for a GPS readout. */
export const formatCoord = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Metres offset converted to degrees, for scattering gates around a centroid. */
export function offsetPoint(origin: LatLng, northM: number, eastM: number): LatLng {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = ((eastM / EARTH_RADIUS_M) * (180 / Math.PI)) / Math.cos(toRad(origin.lat));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}
