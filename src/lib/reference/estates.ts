import type { Estate, LatLng } from "../types";

/**
 * Estates served by the platform, with approximate centroids in WGS84.
 * Coordinates are rounded neighbourhood centres, good enough to place a service
 * area on a basemap — not surveyed boundaries.
 */
export const ESTATES: Record<string, Estate> = {
  RUA: { code: "RUA", name: "Ruaka", lat: -1.2028, lng: 36.7736, radius: 1400, days: [2, 5] },
  KAS: { code: "KAS", name: "Kasarani", lat: -1.2226, lng: 36.8964, radius: 2000, days: [1, 4] },
  WES: { code: "WES", name: "Westlands", lat: -1.2674, lng: 36.8108, radius: 1500, days: [2, 5] },
  LAV: { code: "LAV", name: "Lavington", lat: -1.2793, lng: 36.7712, radius: 1500, days: [1, 4] },
  KIL: { code: "KIL", name: "Kilimani", lat: -1.2906, lng: 36.7869, radius: 1400, days: [1, 4] },
  UMO: { code: "UMO", name: "Umoja", lat: -1.2812, lng: 36.8896, radius: 1500, days: [3, 6] },
  SOB: { code: "SOB", name: "South B", lat: -1.309, lng: 36.8334, radius: 1400, days: [2, 5] },
  EMB: { code: "EMB", name: "Embakasi", lat: -1.3218, lng: 36.8942, radius: 2200, days: [1, 4] },
  LAN: {
    code: "LAN",
    name: "Lang’ata",
    lat: -1.338,
    lng: 36.756,
    radius: 2000,
    days: [3, 6],
  },
  KAR: { code: "KAR", name: "Karen", lat: -1.319, lng: 36.7076, radius: 2600, days: [3] },
};

export const ESTATE_LIST = Object.values(ESTATES);

export const estateName = (code: string) => ESTATES[code]?.name ?? code;

export const estatePoint = (code: string): LatLng => {
  const e = ESTATES[code];
  return { lat: e.lat, lng: e.lng };
};

/** Nairobi city centre — the default map view. */
export const NAIROBI_CENTRE: LatLng = { lat: -1.2864, lng: 36.8172 };
