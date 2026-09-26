/*
 * Fleet management: the vehicle register, daily checks, maintenance, fuel,
 * compliance documents and the figures worked out from them. Shared by client
 * and server — the server stores records, the reports here are pure functions
 * over them (the same split as lib/accounting).
 *
 * Amounts are whole shillings, distances kilometres, like the rest of the app.
 */

import { distanceMeters } from "./geo";
import { ESTATES } from "./reference/estates";
import type { LatLng } from "./types";

/* ---------------- vehicles ---------------- */

export type VehicleState = "active" | "workshop" | "off_road";

export const VEHICLE_STATE_LABEL: Record<VehicleState, string> = {
  active: "In service",
  workshop: "In the workshop",
  off_road: "Off the road",
};

export interface Vehicle {
  /** The number plate; the same id as the live truck. */
  truck: string;
  company: string;
  make: string;
  model: string;
  year: number;
  /** Payload in kilograms. */
  capacityKg: number;
  fuel: "diesel" | "petrol";
  tankL: number;
  odometerKm: number;
  state: VehicleState;
  /** Service every so many km or days, whichever comes first. */
  serviceEveryKm: number;
  serviceEveryDays: number;
  lastServiceKm: number;
  /** "YYYY-MM-DD" */
  lastServiceDate: string;
  /** What this vehicle should manage on a litre; fuel alerts compare against it. */
  expectedKmPerL: number;
  /** The driver currently assigned, by name (the live truck's driver). */
  driver: string;
}

/* ---------------- daily vehicle check ---------------- */

/** The start-of-day walk-round, written for a compactor or tipper on a Nairobi route. */
export const CHECK_ITEMS: { key: string; label: string; hint: string; critical: boolean }[] = [
  { key: "tyres", label: "Tyres and wheel nuts", hint: "Pressure, cuts, tread, loose nuts", critical: true },
  { key: "brakes", label: "Brakes", hint: "Foot and hand brake hold", critical: true },
  { key: "lights", label: "Lights and indicators", hint: "Head, brake, reverse, hazard", critical: false },
  { key: "mirrors", label: "Mirrors, horn and wipers", hint: "", critical: false },
  { key: "leaks", label: "No fluid leaks", hint: "Oil, diesel, hydraulic, coolant", critical: true },
  { key: "hydraulics", label: "Compactor and bin lift", hint: "Hydraulics, controls, emergency stop", critical: true },
  { key: "cover", label: "Load cover or net", hint: "Nothing may blow off on the road", critical: false },
  { key: "safety", label: "Fire extinguisher and first-aid kit", hint: "", critical: false },
  { key: "ppe", label: "Crew PPE", hint: "Gloves, boots, reflective vests", critical: false },
  { key: "seatbelts", label: "Seat belts", hint: "", critical: false },
];

export type CheckAnswer = "ok" | "defect";

export interface Inspection {
  id: number;
  truck: string;
  driver: string;
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  odometerKm: number;
  items: Record<string, CheckAnswer>;
  notes: string;
  photo?: string;
  result: "pass" | "defects";
}

export const defectsOf = (items: Record<string, CheckAnswer>) =>
  CHECK_ITEMS.filter((i) => items[i.key] === "defect");

/** A failed critical item keeps the truck off the road until it's fixed. */
export const hasCriticalDefect = (items: Record<string, CheckAnswer>) => defectsOf(items).some((i) => i.critical);

/* ---------------- maintenance ---------------- */

export type WorkOrderKind = "service" | "repair" | "defect";
export type WorkOrderStatus = "open" | "in_progress" | "done" | "cancelled";

export const WORK_ORDER_KIND_LABEL: Record<WorkOrderKind, string> = {
  service: "Scheduled service",
  repair: "Repair",
  defect: "Defect from daily check",
};

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Open",
  in_progress: "In the workshop",
  done: "Done",
  cancelled: "Cancelled",
};

export interface WorkOrder {
  id: string;
  company: string;
  truck: string;
  kind: WorkOrderKind;
  title: string;
  detail: string;
  status: WorkOrderStatus;
  openedAt: string;
  openedBy: string;
  closedAt?: string;
  /** The daily check that raised it, for defects. */
  inspection?: number;
  vendor: string;
  partsCost: number;
  labourCost: number;
  /** Account the bill was paid from; see PAYMENT_ACCOUNTS. */
  paidFrom: string;
  odometerKm?: number;
}

export const workOrderCost = (w: Pick<WorkOrder, "partsCost" | "labourCost">) => w.partsCost + w.labourCost;

/** Where fleet bills are paid from, as accounts in the chart. */
export const PAYMENT_ACCOUNTS: { code: string; label: string }[] = [
  { code: "1000", label: "M-Pesa" },
  { code: "1010", label: "Bank" },
  { code: "1020", label: "Petty cash" },
  { code: "2000", label: "On credit (pay later)" },
];

export const paymentLabel = (code: string) => PAYMENT_ACCOUNTS.find((a) => a.code === code)?.label ?? code;

export interface ServiceDue {
  /** Kilometres left before the service; negative once overdue. */
  kmLeft: number;
  /** Days left; negative once overdue. */
  daysLeft: number;
  dueDate: string;
  dueKm: number;
  status: "ok" | "soon" | "overdue";
}

const DAY_MS = 86_400_000;

export const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** When the next service falls due, by distance or by date, whichever is sooner. */
export function serviceDue(v: Vehicle, today: string): ServiceDue {
  const dueKm = v.lastServiceKm + v.serviceEveryKm;
  const dueDate = addDays(v.lastServiceDate, v.serviceEveryDays);
  const kmLeft = Math.round(dueKm - v.odometerKm);
  const daysLeft = daysBetween(today, dueDate);
  const status = kmLeft < 0 || daysLeft < 0 ? "overdue" : kmLeft <= 500 || daysLeft <= 14 ? "soon" : "ok";
  return { kmLeft, daysLeft, dueDate, dueKm, status };
}

/* ---------------- fuel ---------------- */

export interface FuelLog {
  id: string;
  company: string;
  truck: string;
  at: string;
  litres: number;
  amount: number;
  odometerKm: number;
  station: string;
  paidFrom: string;
  reference?: string;
  driver: string;
  photo?: string;
}

/** Tailpipe CO₂ per litre burned (IPCC default factors). */
export const CO2_KG_PER_L = { diesel: 2.68, petrol: 2.31 } as const;

export interface FuelEfficiency {
  log: FuelLog;
  /** km since the previous fill, and what that makes per litre. */
  km?: number;
  kmPerL?: number;
  /** Set when this fill looks wrong for the vehicle. */
  flag?: "low_efficiency" | "over_tank";
}

/**
 * Efficiency between fills, full-tank to full-tank: the km driven since the
 * previous fill divided by the litres put back in. A fill that makes far fewer
 * km per litre than the vehicle should — or more litres than the tank holds —
 * is flagged: a leak, siphoning or a padded receipt.
 */
export function fuelEfficiency(logs: FuelLog[], v: Pick<Vehicle, "tankL" | "expectedKmPerL">, alertPct: number): FuelEfficiency[] {
  const sorted = [...logs].sort((a, b) => a.odometerKm - b.odometerKm || a.at.localeCompare(b.at));
  return sorted.map((log, i) => {
    const out: FuelEfficiency = { log };
    if (log.litres > v.tankL * 1.05) out.flag = "over_tank";
    const prev = sorted[i - 1];
    if (prev && log.odometerKm > prev.odometerKm && log.litres > 0) {
      out.km = log.odometerKm - prev.odometerKm;
      out.kmPerL = out.km / log.litres;
      if (!out.flag && out.kmPerL < v.expectedKmPerL * (1 - alertPct / 100)) out.flag = "low_efficiency";
    }
    return out;
  });
}

/* ---------------- documents ---------------- */

export type DocSubject = "vehicle" | "driver";

export const DOC_KINDS: { key: string; label: string; subject: DocSubject }[] = [
  { key: "insurance", label: "Insurance cover", subject: "vehicle" },
  { key: "inspection", label: "NTSA inspection certificate", subject: "vehicle" },
  { key: "nema", label: "NEMA waste transport licence", subject: "vehicle" },
  { key: "county", label: "County waste collection permit", subject: "vehicle" },
  { key: "licence", label: "Driving licence", subject: "driver" },
  { key: "conduct", label: "Certificate of good conduct", subject: "driver" },
];

export const docLabel = (kind: string) => DOC_KINDS.find((k) => k.key === kind)?.label ?? kind;

export interface FleetDocument {
  id: number;
  company: string;
  subjectType: DocSubject;
  /** Plate for a vehicle, user id for a driver. */
  subject: string;
  /** Display name: the plate, or the driver's name. */
  subjectName: string;
  kind: string;
  number: string;
  expiresOn: string;
  cost: number;
  paidFrom: string;
  /** "YYYY-MM-DD HH:mm" */
  recordedAt: string;
}

/** Warn this many days before a document runs out. */
export const DOC_WARN_DAYS = 30;

export function docStatus(expiresOn: string, today: string): { status: "valid" | "expiring" | "expired"; daysLeft: number } {
  const daysLeft = daysBetween(today, expiresOn);
  return { daysLeft, status: daysLeft < 0 ? "expired" : daysLeft <= DOC_WARN_DAYS ? "expiring" : "valid" };
}

/** The newest document of each kind per subject — a renewal supersedes the old one. */
export function currentDocuments(docs: FleetDocument[]): FleetDocument[] {
  const latest = new Map<string, FleetDocument>();
  for (const d of docs) {
    const key = `${d.subjectType}|${d.subject}|${d.kind}`;
    const seen = latest.get(key);
    if (!seen || d.expiresOn > seen.expiresOn || (d.expiresOn === seen.expiresOn && d.id > seen.id)) latest.set(key, d);
  }
  return [...latest.values()];
}

/* ---------------- incidents ---------------- */

export type IncidentKind = "accident" | "breakdown" | "theft" | "injury" | "spill" | "traffic";

export const INCIDENT_KINDS: { key: IncidentKind; label: string }[] = [
  { key: "accident", label: "Road accident" },
  { key: "breakdown", label: "Breakdown on route" },
  { key: "theft", label: "Theft or break-in" },
  { key: "injury", label: "Crew injury" },
  { key: "spill", label: "Waste spill" },
  { key: "traffic", label: "Traffic offence or fine" },
];

export const incidentLabel = (kind: string) => INCIDENT_KINDS.find((k) => k.key === kind)?.label ?? kind;

export interface Incident {
  id: string;
  company: string;
  truck: string;
  driver: string;
  at: string;
  kind: IncidentKind;
  severity: "minor" | "major";
  description: string;
  lat?: number;
  lng?: number;
  photo?: string;
  /** Police OB number, for accidents and theft. */
  policeRef?: string;
  status: "open" | "closed";
  cost: number;
}

/* ---------------- telemetry ---------------- */

export interface FleetSettings {
  /** Urban limit for a heavy goods vehicle. */
  speedLimitKmh: number;
  /** Stationary this long away from the depot and dumpsite counts as idling. */
  idleMinutes: number;
  /** Working hours, "HH:mm", Nairobi time; movement outside them is flagged. */
  dayStart: string;
  dayEnd: string;
  /** Flag a fill this many percent less efficient than the vehicle's expected km/L. */
  fuelAlertPct: number;
}

export const DEFAULT_FLEET_SETTINGS: FleetSettings = {
  speedLimitKmh: 60,
  idleMinutes: 20,
  dayStart: "05:30",
  dayEnd: "19:30",
  fuelAlertPct: 25,
};

export type ZoneKind = "depot" | "dumpsite" | "estate";

export interface Zone {
  id: string;
  kind: ZoneKind;
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

/** Dandora, the city's disposal site — where every company tips. */
export const DUMPSITE: Zone = { id: "dumpsite", kind: "dumpsite", name: "Dandora dumpsite", lat: -1.2489, lng: 36.9012, radius: 600 };

/** Each company's yard, where trucks park overnight. */
export const DEPOTS: Record<string, Zone> = {
  TS: { id: "depot:TS", kind: "depot", name: "Ngong Road yard", lat: -1.3004, lng: 36.7702, radius: 250 },
  KW: { id: "depot:KW", kind: "depot", name: "Thika Road yard", lat: -1.2195, lng: 36.8790, radius: 250 },
  MZ: { id: "depot:MZ", kind: "depot", name: "Industrial Area yard", lat: -1.3052, lng: 36.8521, radius: 250 },
};

/** Geofences for one company: its yard, the dumpsite, then its service estates. */
export function zonesFor(company: string, estates: string[]): Zone[] {
  const zones: Zone[] = [];
  if (DEPOTS[company]) zones.push(DEPOTS[company]);
  zones.push(DUMPSITE);
  for (const code of estates) {
    const e = ESTATES[code];
    if (e) zones.push({ id: `estate:${code}`, kind: "estate", name: e.name, lat: e.lat, lng: e.lng, radius: e.radius });
  }
  return zones;
}

/** The first zone containing the point; depot and dumpsite win over an estate they overlap. */
export const zoneAt = (zones: Zone[], p: LatLng) => zones.find((z) => distanceMeters(z, p) <= z.radius) ?? null;

export type FleetEventKind = "speeding" | "idle" | "after_hours" | "zone_enter" | "zone_exit";

export interface FleetEvent {
  id?: number;
  truck: string;
  driver: string;
  /** Epoch ms. */
  at: number;
  kind: FleetEventKind;
  lat: number;
  lng: number;
  zone?: string;
  /** Speed for speeding, minutes for idling. */
  value?: number;
}

export const EVENT_LABEL: Record<FleetEventKind, string> = {
  speeding: "Speeding",
  idle: "Idling",
  after_hours: "Moved after hours",
  zone_enter: "Arrived",
  zone_exit: "Left",
};

/** One truck-day of driving, kept up to date as positions arrive. */
export interface FleetDay {
  truck: string;
  day: string;
  driver: string;
  km: number;
  movingMin: number;
  idleMin: number;
  maxKmh: number;
  dumpRuns: number;
  speeding: number;
  afterHours: number;
}

export interface Ping {
  at: number;
  lat: number;
  lng: number;
  kmh?: number;
}

/* ---------------- driver scorecards ---------------- */

export interface DriverScore {
  driver: string;
  truck?: string;
  km: number;
  days: number;
  speeding: number;
  idleMin: number;
  afterHours: number;
  checksDone: number;
  incidents: number;
  score: number;
  /** What cost points, for the breakdown under the score. */
  penalties: { label: string; points: number }[];
}

/**
 * A plain rubric, so a driver can see exactly why they scored what they did:
 * speeding and idling are weighed per 100 km so long routes aren't punished,
 * and missing the start-of-day check costs as much as it risks.
 */
export function driverScores(
  days: FleetDay[],
  inspections: Pick<Inspection, "driver" | "at">[],
  incidents: Pick<Incident, "driver" | "kind" | "severity">[],
  assigned: Record<string, string>,
): DriverScore[] {
  const drivers = new Set([...days.map((d) => d.driver), ...Object.keys(assigned)]);
  const out: DriverScore[] = [];
  for (const driver of drivers) {
    const mine = days.filter((d) => d.driver === driver && d.km > 1);
    const km = mine.reduce((s, d) => s + d.km, 0);
    const workDays = new Set(mine.map((d) => d.day));
    const checkDays = new Set(inspections.filter((i) => i.driver === driver).map((i) => i.at.slice(0, 10)));
    const checksDone = [...workDays].filter((d) => checkDays.has(d)).length;
    const speeding = mine.reduce((s, d) => s + d.speeding, 0);
    const idleMin = mine.reduce((s, d) => s + d.idleMin, 0);
    const afterHours = mine.reduce((s, d) => s + d.afterHours, 0);
    const mineIncidents = incidents.filter((i) => i.driver === driver && (i.kind === "accident" || i.kind === "traffic"));

    const per100 = km > 0 ? 100 / km : 0;
    const penalties = [
      { label: "Speeding", points: Math.min(35, Math.round(speeding * per100 * 8)) },
      { label: "Idling", points: Math.min(20, Math.round((idleMin / 10) * per100 * 4)) },
      { label: "After-hours movement", points: Math.min(15, afterHours * 5) },
      { label: "Missed daily checks", points: Math.min(20, (workDays.size - checksDone) * 4) },
      { label: "Accidents and offences", points: Math.min(30, mineIncidents.reduce((s, i) => s + (i.severity === "major" ? 15 : 8), 0)) },
    ].filter((p) => p.points > 0);
    const score = Math.max(0, 100 - penalties.reduce((s, p) => s + p.points, 0));
    out.push({
      driver,
      truck: assigned[driver],
      km: Math.round(km),
      days: workDays.size,
      speeding,
      idleMin: Math.round(idleMin),
      afterHours,
      checksDone,
      incidents: mineIncidents.length,
      score,
      penalties,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.km - a.km);
}

/* ---------------- cost and utilisation ---------------- */

export interface VehicleCosts {
  truck: string;
  km: number;
  activeDays: number;
  fuelL: number;
  fuelCost: number;
  maintenanceCost: number;
  complianceCost: number;
  tonnes: number;
  co2Kg: number;
  /** Fuel plus maintenance per km; undefined without distance. */
  costPerKm?: number;
  /** Everything per tonne collected; undefined without tonnage. */
  costPerTonne?: number;
  kmPerL?: number;
}

export function vehicleCosts(
  v: Vehicle,
  period: { from: string; to: string },
  data: {
    days: FleetDay[];
    fuel: FuelLog[];
    workOrders: WorkOrder[];
    documents: FleetDocument[];
    tonnesByTruck: Record<string, number>;
  },
): VehicleCosts {
  const inside = (ymd: string) => ymd >= period.from && ymd <= period.to;
  const days = data.days.filter((d) => d.truck === v.truck && inside(d.day));
  const fuel = data.fuel.filter((f) => f.truck === v.truck && inside(f.at.slice(0, 10)));
  const wos = data.workOrders.filter((w) => w.truck === v.truck && w.status === "done" && w.closedAt && inside(w.closedAt.slice(0, 10)));
  const docs = data.documents.filter((d) => d.subjectType === "vehicle" && d.subject === v.truck && inside(d.recordedAt.slice(0, 10)));

  const km = days.reduce((s, d) => s + d.km, 0);
  const fuelL = fuel.reduce((s, f) => s + f.litres, 0);
  const fuelCost = fuel.reduce((s, f) => s + f.amount, 0);
  const maintenanceCost = wos.reduce((s, w) => s + workOrderCost(w), 0);
  const complianceCost = docs.reduce((s, d) => s + d.cost, 0);
  const tonnes = data.tonnesByTruck[v.truck] ?? 0;
  const total = fuelCost + maintenanceCost + complianceCost;
  return {
    truck: v.truck,
    km: Math.round(km),
    activeDays: days.filter((d) => d.km > 1).length,
    fuelL: Math.round(fuelL),
    fuelCost,
    maintenanceCost,
    complianceCost,
    tonnes,
    co2Kg: Math.round(fuelL * CO2_KG_PER_L[v.fuel]),
    costPerKm: km > 0 ? (fuelCost + maintenanceCost) / km : undefined,
    costPerTonne: tonnes > 0 ? total / tonnes : undefined,
    kmPerL: fuelL > 0 && km > 0 ? km / fuelL : undefined,
  };
}

/** Working days (Mon–Sat) in a span, for utilisation. */
export function workingDays(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) n++;
  }
  return n;
}

/* ---------------- alerts ---------------- */

export type FleetAlertKind = "document" | "service" | "defect" | "fuel" | "driving" | "check";

export interface FleetAlert {
  /** Stable per condition, so the notification bell can track read state. */
  id: string;
  kind: FleetAlertKind;
  severity: "warn" | "bad";
  truck?: string;
  title: string;
  body: string;
  at: string;
}

/* ---------------- data bundle ---------------- */

export interface FleetDriver {
  /** User id. */
  id: string;
  name: string;
  truck?: string;
}

/** Everything the fleet screens need for one company, in one fetch. */
export interface FleetBundle {
  company: string;
  today: string;
  settings: FleetSettings;
  vehicles: Vehicle[];
  drivers: FleetDriver[];
  documents: FleetDocument[];
  inspections: Inspection[];
  workOrders: WorkOrder[];
  fuel: FuelLog[];
  incidents: Incident[];
  days: FleetDay[];
  events: FleetEvent[];
  /** Tonnes collected per truck over the last 30 days, from proof of collection. */
  tonnesByTruck: Record<string, number>;
  alerts: FleetAlert[];
  canManage: boolean;
}

export interface TrackDay {
  truck: string;
  day: string;
  pings: Ping[];
  events: FleetEvent[];
  summary?: FleetDay;
  zones: Zone[];
}
