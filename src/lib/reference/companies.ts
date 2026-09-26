import type { Company } from "../types";
import { store } from "./registry";

/** Licensed collection companies, from the database. Each owns a Paybill and a set of estates. */
export const COMPANIES: Company[] = store.companies;

/** Stands in for a company that isn't (or is no longer) on the platform, so screens don't break. */
const unknownCompany = (id: string): Company => ({
  id,
  name: id || "Unknown company",
  paybill: "",
  care: "",
  hours: "",
  color: "#64748B",
  estates: [],
});

export const companyById = (id: string): Company => COMPANIES.find((c) => c.id === id) ?? unknownCompany(id);

export const companyForEstate = (estate: string): Company | undefined =>
  COMPANIES.find((c) => c.estates.includes(estate));
