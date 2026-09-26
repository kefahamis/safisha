import type { Estate, LatLng } from "../types";
import { store } from "./registry";

/**
 * Estates served by the platform, from the database, with approximate centroids
 * in WGS84 — good enough to place a service area on a basemap, not surveyed
 * boundaries.
 */
export const ESTATES: Record<string, Estate> = store.estates;

export const ESTATE_LIST: Estate[] = store.list;

/** Nairobi city centre — the default map view. */
export const NAIROBI_CENTRE: LatLng = { lat: -1.2864, lng: 36.8172 };

export const estateName = (code: string) => ESTATES[code]?.name ?? code;

export const estatePoint = (code: string): LatLng => {
  const e = ESTATES[code];
  return e ? { lat: e.lat, lng: e.lng } : NAIROBI_CENTRE;
};
