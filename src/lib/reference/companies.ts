import type { Company } from "../types";

/** Licensed collection companies. Each owns a Paybill and a set of estates. */
export const COMPANIES: Company[] = [
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

export const companyById = (id: string): Company =>
  COMPANIES.find((c) => c.id === id) ?? COMPANIES[0];

export const companyForEstate = (estate: string): Company | undefined =>
  COMPANIES.find((c) => c.estates.includes(estate));
