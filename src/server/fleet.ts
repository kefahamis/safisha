// Server-only. Fleet management: the register, GPS telemetry, alerts, and fleet costs in the books.
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { JournalEntry } from "@/lib/accounting";
import type { Session } from "@/lib/auth/types";
import {
  CHECK_ITEMS,
  currentDocuments,
  DEFAULT_FLEET_SETTINGS,
  defectsOf,
  docLabel,
  docStatus,
  DOC_KINDS,
  fuelEfficiency,
  serviceDue,
  zonesFor,
  type CheckAnswer,
  type FleetAlert,
  type FleetBundle,
  type FleetDay,
  type FleetDocument,
  type FleetDriver,
  type FleetEvent,
  type FleetSettings,
  type FuelLog,
  type Incident,
  type Inspection,
  type TrackDay,
  type Vehicle,
  type WorkOrder,
} from "@/lib/fleet";
import { companyById } from "@/lib/reference/companies";
import { nairobiDay, step, type TelemetryState } from "@/lib/telemetry";
import { getDb, schema, type Db } from "./db";
import { nextPrefixedId } from "./ids";
import { HttpError } from "./session";
import { nowStamp, today } from "./time";

const t = schema;

type VehicleRow = typeof t.vehicles.$inferSelect;
type TruckRow = typeof t.trucks.$inferSelect;

/* ---------------- settings ---------------- */

export async function fleetSettings(company: string): Promise<FleetSettings> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(t.settings)
    .where(and(eq(t.settings.scope, company), eq(t.settings.key, "fleet")));
  return { ...DEFAULT_FLEET_SETTINGS, ...((row?.config ?? {}) as Partial<FleetSettings>) };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveFleetSettings(company: string, input: FleetSettings, actor: string) {
  const clean: FleetSettings = {
    speedLimitKmh: Math.round(input.speedLimitKmh),
    idleMinutes: Math.round(input.idleMinutes),
    dayStart: input.dayStart,
    dayEnd: input.dayEnd,
    fuelAlertPct: Math.round(input.fuelAlertPct),
  };
  if (!(clean.speedLimitKmh >= 20 && clean.speedLimitKmh <= 120)) throw new HttpError(400, "Speed limit must be 20–120 km/h.");
  if (!(clean.idleMinutes >= 5 && clean.idleMinutes <= 240)) throw new HttpError(400, "Idle time must be 5–240 minutes.");
  if (!TIME.test(clean.dayStart) || !TIME.test(clean.dayEnd) || clean.dayStart >= clean.dayEnd) {
    throw new HttpError(400, "Working hours need a start before the end, like 05:30 to 19:30.");
  }
  if (!(clean.fuelAlertPct >= 5 && clean.fuelAlertPct <= 80)) throw new HttpError(400, "Fuel alert must be 5–80%.");
  const db = await getDb();
  await db
    .insert(t.settings)
    .values({ scope: company, key: "fleet", config: { ...clean }, status: "ok", updatedBy: actor })
    .onConflictDoUpdate({
      target: [t.settings.scope, t.settings.key],
      set: { config: { ...clean }, updatedAt: new Date(), updatedBy: actor },
    });
  return clean;
}

/* ---------------- mapping ---------------- */

const toVehicle = (v: VehicleRow, driver: string): Vehicle => ({
  truck: v.truck,
  company: v.company,
  make: v.make,
  model: v.model,
  year: v.year,
  capacityKg: v.capacityKg,
  fuel: v.fuel === "petrol" ? "petrol" : "diesel",
  tankL: v.tankL,
  odometerKm: Math.round(v.odometerKm),
  state: v.state as Vehicle["state"],
  serviceEveryKm: v.serviceEveryKm,
  serviceEveryDays: v.serviceEveryDays,
  lastServiceKm: Math.round(v.lastServiceKm),
  lastServiceDate: v.lastServiceDate,
  expectedKmPerL: v.expectedKmPerL,
  driver,
});

const toWorkOrder = (w: typeof t.workOrders.$inferSelect): WorkOrder => ({
  id: w.id,
  company: w.company,
  truck: w.truck,
  kind: w.kind as WorkOrder["kind"],
  title: w.title,
  detail: w.detail,
  status: w.status as WorkOrder["status"],
  openedAt: w.openedAt,
  openedBy: w.openedBy,
  closedAt: w.closedAt ?? undefined,
  inspection: w.inspection ?? undefined,
  vendor: w.vendor,
  partsCost: w.partsCost,
  labourCost: w.labourCost,
  paidFrom: w.paidFrom,
  odometerKm: w.odometerKm ?? undefined,
});

const toFuel = (f: typeof t.fuelLogs.$inferSelect): FuelLog => ({
  id: f.id,
  company: f.company,
  truck: f.truck,
  at: f.at,
  litres: f.litres,
  amount: f.amount,
  odometerKm: Math.round(f.odometerKm),
  station: f.station,
  paidFrom: f.paidFrom,
  reference: f.reference ?? undefined,
  driver: f.driver,
  photo: f.photo ?? undefined,
});

const toDocument = (d: typeof t.fleetDocuments.$inferSelect): FleetDocument => ({
  id: d.id,
  company: d.company,
  subjectType: d.subjectType as FleetDocument["subjectType"],
  subject: d.subject,
  subjectName: d.subjectName,
  kind: d.kind,
  number: d.number,
  expiresOn: d.expiresOn,
  cost: d.cost,
  paidFrom: d.paidFrom,
  recordedAt: d.recordedAt,
});

const toInspection = (i: typeof t.inspections.$inferSelect): Inspection => ({
  id: i.id,
  truck: i.truck,
  driver: i.driver,
  at: i.at,
  odometerKm: Math.round(i.odometerKm),
  items: i.items as Record<string, CheckAnswer>,
  notes: i.notes,
  photo: i.photo ?? undefined,
  result: i.result as Inspection["result"],
});

const toIncident = (x: typeof t.incidents.$inferSelect): Incident => ({
  id: x.id,
  company: x.company,
  truck: x.truck,
  driver: x.driver,
  at: x.at,
  kind: x.kind as Incident["kind"],
  severity: x.severity as Incident["severity"],
  description: x.description,
  lat: x.lat ?? undefined,
  lng: x.lng ?? undefined,
  photo: x.photo ?? undefined,
  policeRef: x.policeRef ?? undefined,
  status: x.status as Incident["status"],
  cost: x.cost,
});

const toEvent = (e: typeof t.fleetEvents.$inferSelect): FleetEvent => ({
  id: e.id,
  truck: e.truck,
  driver: e.driver,
  at: e.at.getTime(),
  kind: e.kind as FleetEvent["kind"],
  lat: e.lat,
  lng: e.lng,
  zone: e.zone ?? undefined,
  value: e.value ?? undefined,
});

const toDay = (d: typeof t.fleetDays.$inferSelect): FleetDay => ({
  truck: d.truck,
  day: d.day,
  driver: d.driver,
  km: Math.round(d.km * 10) / 10,
  movingMin: Math.round(d.movingMin),
  idleMin: Math.round(d.idleMin),
  maxKmh: Math.round(d.maxKmh),
  dumpRuns: d.dumpRuns,
  speeding: d.speeding,
  afterHours: d.afterHours,
});

/* ---------------- ids ---------------- */

export async function nextFleetId(
  db: Db,
  table: typeof t.workOrders | typeof t.fuelLogs | typeof t.incidents,
  prefix: string,
  start: number,
) {
  return nextPrefixedId(db, table, prefix, start);
}

/* ---------------- telemetry ---------------- */

/**
 * Folds one GPS fix from a collector's phone into the truck's trip history:
 * stores the point, raises any events and adds to the day's totals. The
 * odometer follows the GPS between the readings drivers type in.
 */
export async function recordPing(truck: TruckRow, lat: number, lng: number, at = new Date()) {
  const db = await getDb();
  const [v] = await db.select().from(t.vehicles).where(eq(t.vehicles.truck, truck.id));
  const settings = await fleetSettings(truck.company);
  const zones = zonesFor(truck.company, companyById(truck.company).estates);
  const prev = (v?.telemetry as TelemetryState | null | undefined) ?? null;
  const res = step(prev, { at: at.getTime(), lat, lng }, { truck: truck.id, driver: truck.driver, zones, settings });

  await db.insert(t.gpsPings).values({ truck: truck.id, at, lat, lng, kmh: res.kmh ?? null });
  if (res.events.length) {
    await db.insert(t.fleetEvents).values(
      res.events.map((e) => ({
        company: truck.company,
        truck: e.truck,
        driver: e.driver,
        at: new Date(e.at),
        kind: e.kind,
        lat: e.lat,
        lng: e.lng,
        zone: e.zone ?? null,
        value: e.value ?? null,
      })),
    );
  }
  let km = 0;
  for (const d of res.deltas) {
    km += d.km;
    await db
      .insert(t.fleetDays)
      .values({ truck: truck.id, company: truck.company, driver: truck.driver, ...d })
      .onConflictDoUpdate({
        target: [t.fleetDays.truck, t.fleetDays.day],
        set: {
          km: sql`${t.fleetDays.km} + ${d.km}`,
          movingMin: sql`${t.fleetDays.movingMin} + ${d.movingMin}`,
          idleMin: sql`${t.fleetDays.idleMin} + ${d.idleMin}`,
          maxKmh: sql`greatest(${t.fleetDays.maxKmh}, ${d.maxKmh})`,
          dumpRuns: sql`${t.fleetDays.dumpRuns} + ${d.dumpRuns}`,
          speeding: sql`${t.fleetDays.speeding} + ${d.speeding}`,
          afterHours: sql`${t.fleetDays.afterHours} + ${d.afterHours}`,
        },
      });
  }
  if (v) {
    await db
      .update(t.vehicles)
      .set({ telemetry: { ...res.state }, odometerKm: v.odometerKm + km })
      .where(eq(t.vehicles.truck, truck.id));
  }
}

/** One truck's day: every fix, its events, and the totals, for playback. */
export async function trackDay(company: string, truck: string, day: string): Promise<TrackDay> {
  const db = await getDb();
  // The Nairobi day, as UTC instants.
  const from = new Date(Date.parse(`${day}T00:00:00+03:00`));
  const to = new Date(from.getTime() + 86_400_000);
  const [pings, events, [summary]] = await Promise.all([
    db
      .select()
      .from(t.gpsPings)
      .where(and(eq(t.gpsPings.truck, truck), gte(t.gpsPings.at, from), lt(t.gpsPings.at, to)))
      .orderBy(t.gpsPings.at),
    db
      .select()
      .from(t.fleetEvents)
      .where(and(eq(t.fleetEvents.truck, truck), gte(t.fleetEvents.at, from), lt(t.fleetEvents.at, to)))
      .orderBy(t.fleetEvents.at),
    db.select().from(t.fleetDays).where(and(eq(t.fleetDays.truck, truck), eq(t.fleetDays.day, day))),
  ]);
  return {
    truck,
    day,
    pings: pings.map((p) => ({ at: p.at.getTime(), lat: p.lat, lng: p.lng, kmh: p.kmh ?? undefined })),
    events: events.map(toEvent),
    summary: summary ? toDay(summary) : undefined,
    zones: zonesFor(company, companyById(company).estates),
  };
}

/** Days that have a recorded track, newest first, for the playback picker. */
export async function trackedDays(truck: string, limit = 14): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ at: sql<Date>`max(${t.gpsPings.at})` })
    .from(t.gpsPings)
    .where(eq(t.gpsPings.truck, truck))
    .groupBy(sql`date_trunc('day', ${t.gpsPings.at} + interval '3 hours')`)
    .orderBy(desc(sql`max(${t.gpsPings.at})`))
    .limit(limit);
  return rows.map((r) => nairobiDay(new Date(r.at).getTime()));
}

/* ---------------- vehicle state ---------------- */

/**
 * A truck in the workshop is off its route; one with an unfixed safety-critical
 * defect must not be driven; otherwise it's in service.
 */
export async function refreshVehicleState(db: Db, truck: string) {
  const open = await db
    .select()
    .from(t.workOrders)
    .where(and(eq(t.workOrders.truck, truck), inArray(t.workOrders.status, ["open", "in_progress"])));
  const state = open.some((w) => w.status === "in_progress")
    ? "workshop"
    : open.some((w) => w.critical)
      ? "off_road"
      : "active";
  await db.update(t.vehicles).set({ state }).where(eq(t.vehicles.truck, truck));
  return state;
}

/** The last odometer reading a person confirmed: checks, fuel and workshop visits. */
export async function lastConfirmedOdometer(db: Db, truck: string): Promise<number> {
  const [[a], [b], [c]] = await Promise.all([
    db.select({ km: sql<number>`coalesce(max(${t.inspections.odometerKm}), 0)` }).from(t.inspections).where(eq(t.inspections.truck, truck)),
    db.select({ km: sql<number>`coalesce(max(${t.fuelLogs.odometerKm}), 0)` }).from(t.fuelLogs).where(eq(t.fuelLogs.truck, truck)),
    db.select({ km: sql<number>`coalesce(max(${t.workOrders.odometerKm}), 0)` }).from(t.workOrders).where(eq(t.workOrders.truck, truck)),
  ]);
  return Math.max(Number(a.km), Number(b.km), Number(c.km));
}

/* ---------------- drivers ---------------- */

/** Collectors on the company's books, with the truck each is assigned to. */
export async function companyDrivers(company: string): Promise<FleetDriver[]> {
  const db = await getDb();
  const [users, roles] = await Promise.all([db.select().from(t.users), db.select().from(t.roles)]);
  const collectorRoles = new Set(roles.filter((r) => r.workspace === "collector").map((r) => r.id));
  return users
    .filter((u) => collectorRoles.has(u.roleId) && u.scope.companyId === company && !u.suspended)
    .map((u) => ({ id: u.id, name: u.name, truck: u.scope.truckId }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------- alerts ---------------- */

const SEVERITY_RANK = { bad: 0, warn: 1 } as const;

/**
 * What needs someone's attention: expiring papers, services falling due,
 * unfixed defects, suspicious fills, bad driving today and missing checks.
 * Worked out on demand from the records, so nothing can fall out of step.
 */
export async function fleetAlerts(company: string, only?: string): Promise<FleetAlert[]> {
  const db = await getDb();
  const day = today();
  const now = nowStamp();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const onlyTruck = (col: AnyPgColumn) => (only ? eq(col, only) : undefined);

  const [vehicleRows, truckRows, docRows, woRows, fuelRows, eventRows, checkRows, settings, drivers] = await Promise.all([
    db.select().from(t.vehicles).where(and(eq(t.vehicles.company, company), onlyTruck(t.vehicles.truck))),
    db.select().from(t.trucks).where(eq(t.trucks.company, company)),
    db.select().from(t.fleetDocuments).where(eq(t.fleetDocuments.company, company)),
    db
      .select()
      .from(t.workOrders)
      .where(and(eq(t.workOrders.company, company), eq(t.workOrders.kind, "defect"), inArray(t.workOrders.status, ["open", "in_progress"]))),
    db.select().from(t.fuelLogs).where(and(eq(t.fuelLogs.company, company), onlyTruck(t.fuelLogs.truck))),
    db
      .select()
      .from(t.fleetEvents)
      .where(and(eq(t.fleetEvents.company, company), gte(t.fleetEvents.at, since), inArray(t.fleetEvents.kind, ["speeding", "after_hours"]))),
    db.select().from(t.inspections).where(and(eq(t.inspections.company, company), sql`${t.inspections.at} like ${`${day}%`}`)),
    fleetSettings(company),
    companyDrivers(company),
  ]);
  const driverOf = new Map(truckRows.map((x) => [x.id, x.driver]));
  const vehicles = vehicleRows.map((v) => toVehicle(v, driverOf.get(v.truck) ?? ""));
  const plates = new Set(vehicles.map((v) => v.truck));
  const out: FleetAlert[] = [];

  // Papers: vehicles in view, and the drivers assigned to them.
  const docs = currentDocuments(docRows.map(toDocument));
  const myDrivers = drivers.filter((d) => d.truck && plates.has(d.truck));
  for (const v of vehicles) {
    for (const k of DOC_KINDS.filter((k) => k.subject === "vehicle")) {
      const doc = docs.find((d) => d.subjectType === "vehicle" && d.subject === v.truck && d.kind === k.key);
      if (!doc) {
        out.push({ id: `doc:${v.truck}:${k.key}:missing`, kind: "document", severity: "bad", truck: v.truck, title: `${k.label} missing`, body: `No ${k.label.toLowerCase()} on file for ${v.truck}.`, at: `${day} 00:00` });
      }
    }
  }
  for (const d of docs) {
    const mine = d.subjectType === "vehicle" ? plates.has(d.subject) : myDrivers.some((x) => x.id === d.subject);
    if (!mine) continue;
    const { status, daysLeft } = docStatus(d.expiresOn, day);
    if (status === "valid") continue;
    const truck = d.subjectType === "vehicle" ? d.subject : myDrivers.find((x) => x.id === d.subject)?.truck;
    out.push({
      id: `doc:${d.subject}:${d.kind}:${d.expiresOn}:${status}`,
      kind: "document",
      severity: status === "expired" ? "bad" : "warn",
      truck,
      title: status === "expired" ? `${docLabel(d.kind)} expired` : `${docLabel(d.kind)} expiring`,
      body:
        status === "expired"
          ? `${d.subjectName}: expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago (${d.expiresOn}).`
          : `${d.subjectName}: ${daysLeft === 0 ? "expires today" : `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`} (${d.expiresOn}).`,
      at: `${day} 00:00`,
    });
  }

  for (const v of vehicles) {
    const due = serviceDue(v, day);
    if (due.status === "ok") continue;
    out.push({
      id: `service:${v.truck}:${due.dueKm}:${due.status}`,
      kind: "service",
      severity: due.status === "overdue" ? "bad" : "warn",
      truck: v.truck,
      title: due.status === "overdue" ? "Service overdue" : "Service due soon",
      body:
        due.kmLeft < 0
          ? `${v.truck} is ${-due.kmLeft} km past its service.`
          : due.daysLeft < 0
            ? `${v.truck} was due for service on ${due.dueDate}.`
            : `${v.truck}: ${due.kmLeft} km or ${due.daysLeft} days to its next service.`,
      at: `${day} 00:00`,
    });
  }

  for (const w of woRows) {
    if (!plates.has(w.truck)) continue;
    out.push({
      id: `defect:${w.id}`,
      kind: "defect",
      severity: w.critical ? "bad" : "warn",
      truck: w.truck,
      title: w.critical ? "Critical defect: keep off the road" : "Defect reported",
      body: `${w.truck}: ${w.title.replace(/^Defect: /, "")}`,
      at: w.openedAt,
    });
  }

  for (const v of vehicles) {
    const eff = fuelEfficiency(fuelRows.filter((f) => f.truck === v.truck).map(toFuel), v, settings.fuelAlertPct);
    const last = eff[eff.length - 1];
    if (!last?.flag) continue;
    out.push({
      id: `fuel:${last.log.id}`,
      kind: "fuel",
      severity: "warn",
      truck: v.truck,
      title: last.flag === "over_tank" ? "Fill bigger than the tank" : "Fuel use unusually high",
      body:
        last.flag === "over_tank"
          ? `${v.truck}: ${last.log.litres} L logged, the tank holds ${v.tankL} L. Check the receipt.`
          : `${v.truck}: ${last.kmPerL?.toFixed(1)} km/L on the last fill, expected about ${v.expectedKmPerL}. Check for leaks or siphoning.`,
      at: last.log.at,
    });
  }

  const byTruck = new Map<string, typeof eventRows>();
  for (const e of eventRows) if (plates.has(e.truck)) byTruck.set(e.truck, [...(byTruck.get(e.truck) ?? []), e]);
  for (const [truck, evs] of byTruck) {
    const speeding = evs.filter((e) => e.kind === "speeding");
    const late = evs.filter((e) => e.kind === "after_hours");
    const parts = [
      speeding.length ? `${speeding.length} speeding alert${speeding.length === 1 ? "" : "s"}, top ${Math.max(...speeding.map((e) => e.value ?? 0))} km/h` : "",
      late.length ? `moved outside working hours` : "",
    ].filter(Boolean);
    const lastAt = evs.reduce((m, e) => (e.at > m ? e.at : m), evs[0].at);
    out.push({
      id: `driving:${truck}:${evs.length}:${lastAt.getTime()}`,
      kind: "driving",
      severity: late.length ? "bad" : "warn",
      truck,
      title: late.length ? "After-hours movement" : "Speeding",
      body: `${truck} (${driverOf.get(truck) ?? ""}): ${parts.join("; ")} in the last 24 hours.`,
      at: nowStamp(lastAt),
    });
  }

  // Past the start of the working day plus an hour, every truck in service should have been checked.
  const [h, m] = settings.dayStart.split(":").map(Number);
  const checkBy = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (now.slice(11) >= checkBy && new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) {
    for (const v of vehicles) {
      if (v.state !== "active" || checkRows.some((c) => c.truck === v.truck)) continue;
      out.push({
        id: `check:${v.truck}:${day}`,
        kind: "check",
        severity: "warn",
        truck: v.truck,
        title: "No daily check yet",
        body: `${v.truck} (${v.driver}) hasn't had its start-of-day check today.`,
        at: `${day} ${checkBy}`,
      });
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.at.localeCompare(a.at));
}

/** Today's check per truck, for the collector app and the office. */
export async function checksToday(trucks: string[]) {
  if (!trucks.length) return {};
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.inspections)
    .where(and(inArray(t.inspections.truck, trucks), sql`${t.inspections.at} like ${`${today()}%`}`))
    .orderBy(t.inspections.at);
  const out: Record<string, { at: string; result: Inspection["result"]; defects: string[] }> = {};
  for (const r of rows) {
    out[r.truck] = {
      at: r.at,
      result: r.result as Inspection["result"],
      defects: defectsOf(r.items as Record<string, CheckAnswer>).map((i) => i.label),
    };
  }
  return out;
}

/* ---------------- the bundle ---------------- */

export async function fleetBundle(session: Session, company: string, only?: string): Promise<FleetBundle> {
  const db = await getDb();
  const day = today();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since60Day = nairobiDay(Date.now() - 60 * 86_400_000);
  const since45 = nowStamp(new Date(Date.now() - 45 * 86_400_000));
  const where = (companyCol: AnyPgColumn, truckCol: AnyPgColumn) =>
    and(eq(companyCol, company), only ? eq(truckCol, only) : undefined);

  const [settings, truckRows, vehicleRows, docRows, inspectionRows, woRows, fuelRows, incidentRows, dayRows, eventRows, drivers] =
    await Promise.all([
      fleetSettings(company),
      db.select().from(t.trucks).where(eq(t.trucks.company, company)),
      db.select().from(t.vehicles).where(where(t.vehicles.company, t.vehicles.truck)),
      db.select().from(t.fleetDocuments).where(eq(t.fleetDocuments.company, company)),
      db
        .select()
        .from(t.inspections)
        .where(and(where(t.inspections.company, t.inspections.truck), gte(t.inspections.at, since45)))
        .orderBy(desc(t.inspections.at)),
      db.select().from(t.workOrders).where(where(t.workOrders.company, t.workOrders.truck)).orderBy(desc(t.workOrders.openedAt)),
      db.select().from(t.fuelLogs).where(where(t.fuelLogs.company, t.fuelLogs.truck)).orderBy(desc(t.fuelLogs.at)),
      db.select().from(t.incidents).where(where(t.incidents.company, t.incidents.truck)).orderBy(desc(t.incidents.at)),
      db
        .select()
        .from(t.fleetDays)
        .where(and(where(t.fleetDays.company, t.fleetDays.truck), gte(t.fleetDays.day, since60Day))),
      db
        .select()
        .from(t.fleetEvents)
        .where(
          and(
            where(t.fleetEvents.company, t.fleetEvents.truck),
            gte(t.fleetEvents.at, since30),
            inArray(t.fleetEvents.kind, ["speeding", "idle", "after_hours"]),
          ),
        )
        .orderBy(desc(t.fleetEvents.at)),
      companyDrivers(company),
    ]);

  const plates = truckRows.map((x) => x.id);
  const since30Stamp = nowStamp(since30);
  const tonnage = plates.length
    ? await db
        .select({ truck: t.pickups.truck, kg: sql<number>`coalesce(sum(${t.pickups.weightKg}), 0)` })
        .from(t.pickups)
        .where(and(inArray(t.pickups.truck, plates), gte(t.pickups.when, since30Stamp)))
        .groupBy(t.pickups.truck)
    : [];

  const driverOf = new Map(truckRows.map((x) => [x.id, x.driver]));
  const visibleDrivers = only ? drivers.filter((d) => d.truck === only) : drivers;
  const docs = docRows
    .map(toDocument)
    .filter((d) =>
      only ? (d.subjectType === "vehicle" ? d.subject === only : visibleDrivers.some((x) => x.id === d.subject)) : true,
    );

  return {
    company,
    today: day,
    settings,
    vehicles: vehicleRows.map((v) => toVehicle(v, driverOf.get(v.truck) ?? "")).sort((a, b) => a.truck.localeCompare(b.truck)),
    drivers: visibleDrivers,
    documents: docs,
    inspections: inspectionRows.map(toInspection),
    workOrders: woRows.map(toWorkOrder),
    fuel: fuelRows.map(toFuel),
    incidents: incidentRows.map(toIncident),
    days: dayRows.map(toDay),
    events: eventRows.map(toEvent),
    tonnesByTruck: Object.fromEntries(tonnage.map((r) => [r.truck, Math.round(Number(r.kg) / 100) / 10])),
    alerts: await fleetAlerts(company, only),
    canManage: session.permissions.includes("fleet.manage"),
  };
}

/* ---------------- the books ---------------- */

const FUEL = "5000";
const MAINTENANCE = "5200";
const LICENCES = "5600";

/**
 * Fleet costs as journal entries, derived from the fleet records like billing
 * is from txns: a fill is fuel, a finished work order is maintenance, a
 * renewed licence or policy is licences and permits.
 */
export async function fleetPostings(company: string): Promise<JournalEntry[]> {
  const db = await getDb();
  const [fuel, wos, docs] = await Promise.all([
    db.select().from(t.fuelLogs).where(eq(t.fuelLogs.company, company)),
    db.select().from(t.workOrders).where(and(eq(t.workOrders.company, company), eq(t.workOrders.status, "done"))),
    db.select().from(t.fleetDocuments).where(eq(t.fleetDocuments.company, company)),
  ]);
  const out: JournalEntry[] = [];
  for (const f of fuel) {
    if (f.amount <= 0) continue;
    out.push({
      id: `FUEL-${f.id}`,
      date: f.at.slice(0, 10),
      source: "fleet",
      memo: `Fuel · ${f.truck} · ${f.litres} L${f.station ? ` at ${f.station}` : ""}`,
      reference: f.reference ?? f.id,
      lines: [
        { account: FUEL, debit: f.amount, credit: 0 },
        { account: f.paidFrom, debit: 0, credit: f.amount },
      ],
    });
  }
  for (const w of wos) {
    const cost = w.partsCost + w.labourCost;
    if (cost <= 0 || !w.closedAt) continue;
    out.push({
      id: w.id,
      date: w.closedAt.slice(0, 10),
      source: "fleet",
      memo: `${w.title} · ${w.truck}${w.vendor ? ` · ${w.vendor}` : ""}`,
      reference: w.truck,
      lines: [
        { account: MAINTENANCE, debit: cost, credit: 0 },
        { account: w.paidFrom, debit: 0, credit: cost },
      ],
    });
  }
  for (const d of docs) {
    if (d.cost <= 0) continue;
    out.push({
      id: `DOC-${d.id}`,
      date: d.recordedAt.slice(0, 10),
      source: "fleet",
      memo: `${docLabel(d.kind)} · ${d.subjectName}${d.number ? ` · ${d.number}` : ""}`,
      reference: d.subjectType === "vehicle" ? d.subject : d.subjectName,
      lines: [
        { account: LICENCES, debit: d.cost, credit: 0 },
        { account: d.paidFrom, debit: 0, credit: d.cost },
      ],
    });
  }
  return out;
}

/** Every check item answered, and nothing else. */
export function cleanCheckItems(items: Record<string, string>): Record<string, CheckAnswer> | null {
  const out: Record<string, CheckAnswer> = {};
  for (const i of CHECK_ITEMS) {
    const v = items?.[i.key];
    if (v !== "ok" && v !== "defect") return null;
    out[i.key] = v;
  }
  return out;
}
