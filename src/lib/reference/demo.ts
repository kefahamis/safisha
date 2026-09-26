import type { Company, Estate } from "../types";

/*
 * The demo world's companies and estates. They're written to the database by
 * the demo seed (and backfilled into databases seeded before these moved out
 * of code); a real deployment onboards its own from the platform admin.
 */

export const DEMO_COMPANIES: Company[] = [
  {
    id: "TS",
    name: "Taka Safi Services",
    paybill: "400221",
    care: "0709 400 221",
    hours: "Mon–Sat, 7am–7pm",
    color: "#0E7490",
    estates: ["KIL", "LAV", "WES", "KAR"],
  },
  {
    id: "KW",
    name: "Kijani Waste Ltd",
    paybill: "400318",
    care: "0711 318 000",
    hours: "Mon–Fri, 8am–6pm",
    color: "#2FB86A",
    estates: ["RUA", "KAS", "UMO"],
  },
  {
    id: "MZ",
    name: "Mazingira Collectors",
    paybill: "400455",
    care: "0722 455 455",
    hours: "Daily, 6am–8pm",
    color: "#F07A45",
    estates: ["SOB", "EMB", "LAN"],
  },
];

/** Approximate neighbourhood centroids in WGS84 — good enough for a service-area circle. */
export const DEMO_ESTATES: Estate[] = [
  { code: "RUA", name: "Ruaka", lat: -1.2028, lng: 36.7736, radius: 1400, days: [2, 5] },
  { code: "KAS", name: "Kasarani", lat: -1.2226, lng: 36.8964, radius: 2000, days: [1, 4] },
  { code: "WES", name: "Westlands", lat: -1.2674, lng: 36.8108, radius: 1500, days: [2, 5] },
  { code: "LAV", name: "Lavington", lat: -1.2793, lng: 36.7712, radius: 1500, days: [1, 4] },
  { code: "KIL", name: "Kilimani", lat: -1.2906, lng: 36.7869, radius: 1400, days: [1, 4] },
  { code: "UMO", name: "Umoja", lat: -1.2812, lng: 36.8896, radius: 1500, days: [3, 6] },
  { code: "SOB", name: "South B", lat: -1.309, lng: 36.8334, radius: 1400, days: [2, 5] },
  { code: "EMB", name: "Embakasi", lat: -1.3218, lng: 36.8942, radius: 2200, days: [1, 4] },
  { code: "LAN", name: "Lang’ata", lat: -1.338, lng: 36.756, radius: 2000, days: [3, 6] },
  { code: "KAR", name: "Karen", lat: -1.319, lng: 36.7076, radius: 2600, days: [3] },
];
