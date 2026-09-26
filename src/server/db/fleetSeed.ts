// Server-only. A month of fleet history for the demo trucks, so the fleet screens have something to show.
import { sql } from "drizzle-orm";
import {
  CHECK_ITEMS,
  DEFAULT_FLEET_SETTINGS,
  DEPOTS,
  DUMPSITE,
  zonesFor,
  type CheckAnswer,
  type FleetEvent,
  type Ping,
} from "@/lib/fleet";
import { distanceMeters, offsetPoint } from "@/lib/geo";
import { companyById } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { rng } from "@/lib/rng";
import { addDelta, nairobiDay, step, type DayDelta, type TelemetryState } from "@/lib/telemetry";
import type { LatLng } from "@/lib/types";
import { hashPassword } from "../password";
import { nowStamp, today } from "../time";
import { DEMO_PASSWORD } from "./demoPassword";
import type { Db } from "./index";
import * as t from "./schema";

const DIESEL_KES_PER_L = 172;
const HISTORY_DAYS = 30;
/** Full GPS tracks are kept for the most recent days only; totals and events go back further. */
const TRACK_DAYS = 3;

interface Profile {
  make: string;
  model: string;
  year: number;
  capacityKg: number;
  tankL: number;
  odometerKm: number;
  kmPerL: number;
  /** Km past the last service, and days since it, as of today. */
  serviceKmAgo: number;
  serviceDaysAgo: number;
  /** How this driver drives, for the demo: chance per day of each habit. */
  speeding: number;
  idling: number;
  lateTrip: number;
  checks: number;
}

const PROFILES: Record<string, Profile> = {
  "KDA 412X": { make: "Isuzu", model: "FVZ 34K rear-loader compactor", year: 2019, capacityKg: 10000, tankL: 200, odometerKm: 186400, kmPerL: 3.4, serviceKmAgo: 9500, serviceDaysAgo: 58, speeding: 0.08, idling: 0.1, lateTrip: 0, checks: 0.95 },
  "KCZ 118M": { make: "Mitsubishi Fuso", model: "Fighter FK tipper", year: 2016, capacityKg: 7000, tankL: 150, odometerKm: 241900, kmPerL: 4.2, serviceKmAgo: 10700, serviceDaysAgo: 96, speeding: 0.55, idling: 0.15, lateTrip: 0, checks: 0.8 },
  "KDE 907T": { make: "Isuzu", model: "FVR 900 compactor", year: 2021, capacityKg: 9000, tankL: 200, odometerKm: 98200, kmPerL: 3.6, serviceKmAgo: 3200, serviceDaysAgo: 30, speeding: 0.1, idling: 0.55, lateTrip: 0, checks: 0.9 },
  "KBX 551P": { make: "Isuzu", model: "NQR skip loader", year: 2014, capacityKg: 4500, tankL: 100, odometerKm: 312700, kmPerL: 5.5, serviceKmAgo: 5200, serviceDaysAgo: 45, speeding: 0.15, idling: 0.2, lateTrip: 0.18, checks: 0.75 },
  "KDG 230Q": { make: "Hino", model: "500 Series compactor", year: 2018, capacityKg: 10000, tankL: 200, odometerKm: 204300, kmPerL: 3.5, serviceKmAgo: 6100, serviceDaysAgo: 50, speeding: 0.03, idling: 0.05, lateTrip: 0, checks: 1 },
  "KCR 774L": { make: "Tata", model: "LPT 1613 tipper", year: 2013, capacityKg: 8000, tankL: 150, odometerKm: 356800, kmPerL: 4.0, serviceKmAgo: 8000, serviceDaysAgo: 70, speeding: 0.3, idling: 0.2, lateTrip: 0, checks: 0.85 },
};

const FALLBACK: Profile = { make: "Isuzu", model: "FVR compactor", year: 2017, capacityKg: 9000, tankL: 200, odometerKm: 150000, kmPerL: 3.6, serviceKmAgo: 4000, serviceDaysAgo: 40, speeding: 0.1, idling: 0.1, lateTrip: 0, checks: 0.9 };

/** Collectors for the trucks that had no login in the base seed. */
const DRIVER_EMAILS: Record<string, string> = {
  "Mary Atieno": "mary.atieno@takasafi.co.ke",
  "Paul Njoroge": "paul.njoroge@kijaniwaste.co.ke",
  "Hassan Ali": "hassan.ali@kijaniwaste.co.ke",
  "Ibrahim Said": "ibrahim.said@mazingira.co.ke",
};

const STATIONS: Record<string, string[]> = {
  TS: ["Rubis Ngong Road", "TotalEnergies Adams Arcade", "Shell Lavington"],
  KW: ["TotalEnergies Thika Road", "Rubis Kasarani", "Ola Roysambu"],
  MZ: ["Shell Mombasa Road", "Rubis South B", "TotalEnergies Enterprise Road"],
};

const VENDORS = {
  service: "Ngong Road Isuzu service centre",
  hydraulics: "Industrial Area Hydraulics",
  tyres: "Kirinyaga Road Tyre Centre",
  general: "Kariobangi Light Industries garage",
};

/** The Nairobi wall-clock time on a day, as an epoch instant. */
const at = (day: string, hh: number, mm: number) => Date.parse(`${day}T${String(hh).padStart(2, "0")}:${String(Math.floor(mm)).padStart(2, "0")}:00+03:00`);

const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

/** Builds one day's GPS track: yard, the route's estates, the dumpsite, home. */
function dayTrack(company: string, route: string[], day: string, p: Profile, rand: () => number): Ping[] {
  const pings: Ping[] = [];
  let now = at(day, 6, rand() * 40);
  let pos: LatLng = DEPOTS[company] ?? DUMPSITE;
  const fix = (q: LatLng) => pings.push({ at: now, lat: q.lat, lng: q.lng });

  const drive = (to: LatLng, kmh: number) => {
    const metres = distanceMeters(pos, to);
    const secs = metres / (kmh / 3.6);
    const steps = Math.floor(secs / 60);
    const from = pos;
    for (let i = 1; i <= steps; i++) {
      now += 60_000;
      fix(lerp(from, to, (i * 60) / secs));
    }
    now += (secs - steps * 60) * 1000;
    pos = to;
    fix(pos);
  };
  const dwell = (minutes: number) => {
    for (let i = 0; i < minutes; i++) {
      now += 60_000;
      // A phone standing still still wanders a metre or two.
      fix(offsetPoint(pos, (rand() - 0.5) * 3, (rand() - 0.5) * 3));
    }
  };
  const cruise = (fast: boolean) => (fast ? 64 + rand() * 10 : 28 + rand() * 14);

  fix(pos);
  dwell(3);
  const estates = [...new Set(route)];
  const speedy = rand() < p.speeding;
  for (const code of estates) {
    const e = ESTATES[code];
    drive(e, cruise(false) + 6);
    // Collection points around the estate: a gate, a block of flats, a market.
    const stops = route.length > 3 ? 4 : 6;
    for (let s = 0; s < stops; s++) {
      const stop = offsetPoint(e, (rand() - 0.5) * e.radius, (rand() - 0.5) * e.radius);
      drive(stop, 14 + rand() * 8);
      dwell(6 + Math.floor(rand() * 8));
    }
    // A long stand at the roadside between estates.
    if (rand() < p.idling / estates.length) {
      drive(offsetPoint(pos, 900, 700), 25);
      dwell(24 + Math.floor(rand() * 20));
    }
  }
  drive(DUMPSITE, cruise(speedy));
  dwell(20 + Math.floor(rand() * 12));
  drive(DEPOTS[company] ?? DUMPSITE, cruise(speedy && rand() < 0.5));
  dwell(5);

  // An evening run nobody booked.
  if (rand() < p.lateTrip) {
    now = at(day, 20, 5 + rand() * 30);
    fix(pos);
    const home = pos;
    drive(offsetPoint(home, 2200, -1800), 35);
    dwell(12);
    drive(home, 35);
  }
  return pings;
}

function workingDaysBack(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n; i >= 1; i--) {
    const day = nairobiDay(now - i * 86_400_000);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) out.push(day);
  }
  return out;
}

const shift = (day: string, days: number) => nairobiDay(Date.parse(`${day}T12:00:00+03:00`) + days * 86_400_000);

async function insertBatched<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

export async function seedFleetIfEmpty(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.vehicles);
  if (n > 0) return;
  const trucks = await db.select().from(t.trucks);
  if (!trucks.length) return;

  const rand = rng(90_210);
  const day0 = today();
  const days = workingDaysBack(HISTORY_DAYS);
  const trackFrom = days[Math.max(0, days.length - TRACK_DAYS)];

  // Logins for every driver, so each can do their own checks.
  const users = await db.select().from(t.users);
  const driverIds: Record<string, string> = {};
  for (const u of users) if (u.scope.truckId) driverIds[u.name] = u.id;
  const hash = hashPassword(DEMO_PASSWORD);
  for (const truck of trucks) {
    if (driverIds[truck.driver] || !DRIVER_EMAILS[truck.driver]) continue;
    const id = `u-${truck.driver.split(" ")[1].toLowerCase()}`;
    await db
      .insert(t.users)
      .values({
        id,
        email: DRIVER_EMAILS[truck.driver],
        name: truck.driver,
        roleId: "collector",
        scope: { truckId: truck.id, companyId: truck.company },
        grants: [],
        denies: [],
        passwordHash: hash,
        createdAt: "2026-09-01 09:00",
      })
      .onConflictDoNothing();
    driverIds[truck.driver] = id;
  }

  const vehicles: (typeof t.vehicles.$inferInsert)[] = [];
  const pingRows: (typeof t.gpsPings.$inferInsert)[] = [];
  const eventRows: (typeof t.fleetEvents.$inferInsert)[] = [];
  const dayRows: (typeof t.fleetDays.$inferInsert)[] = [];
  const inspections: (typeof t.inspections.$inferInsert)[] = [];
  const fuel: (typeof t.fuelLogs.$inferInsert)[] = [];
  const workOrders: (typeof t.workOrders.$inferInsert)[] = [];
  const documents: (typeof t.fleetDocuments.$inferInsert)[] = [];
  let woSeq = 1000;
  let fuelSeq = 1000;
  const nextWo = () => `WO-${++woSeq}`;

  for (const truck of trucks) {
    const p = PROFILES[truck.id] ?? FALLBACK;
    const zones = zonesFor(truck.company, companyById(truck.company).estates);
    const ctx = { truck: truck.id, driver: truck.driver, zones, settings: DEFAULT_FLEET_SETTINGS };
    const stations = STATIONS[truck.company] ?? ["Rubis"];
    // The offline truck went into the workshop five days ago.
    const inWorkshop = truck.status === "offline";
    const driveDays = inWorkshop ? days.filter((d) => d <= shift(day0, -6)) : days;

    let state: TelemetryState | null = null;
    let odometer = p.odometerKm;
    let sinceFill = 0;

    // An opening fill, so the first efficiency reading has something to measure from.
    fuel.push({
      id: `F-${++fuelSeq}`,
      company: truck.company,
      truck: truck.id,
      at: `${shift(days[0], -1)} 17:10`,
      litres: Math.round(p.tankL * 0.7),
      amount: Math.round(p.tankL * 0.7 * DIESEL_KES_PER_L),
      odometerKm: odometer,
      station: stations[0],
      paidFrom: "1000",
      driver: truck.driver,
    });

    for (const day of driveDays) {
      const startOdo = odometer;
      if (rand() < p.checks) {
        const items: Record<string, CheckAnswer> = Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, "ok"]));
        const defect = rand() < 0.07 ? (rand() < 0.5 ? "lights" : "mirrors") : null;
        if (defect) items[defect] = "defect";
        inspections.push({
          company: truck.company,
          truck: truck.id,
          driver: truck.driver,
          at: `${day} 05:${String(40 + Math.floor(rand() * 19)).padStart(2, "0")}`,
          odometerKm: Math.round(startOdo),
          items,
          notes: defect ? (defect === "lights" ? "Nearside brake light out." : "Offside mirror cracked.") : "",
          result: defect ? "defects" : "pass",
        });
        if (defect) {
          const label = CHECK_ITEMS.find((i) => i.key === defect)!.label;
          workOrders.push({
            id: nextWo(),
            company: truck.company,
            truck: truck.id,
            kind: "defect",
            title: `Defect: ${label}`,
            detail: defect === "lights" ? "Nearside brake light out." : "Offside mirror cracked.",
            status: "done",
            openedAt: `${day} 06:00`,
            openedBy: truck.driver,
            // Fixed the next morning, or the same afternoon if that's still to come.
            closedAt: shift(day, 1) < day0 ? `${shift(day, 1)} 10:30` : `${day} 15:30`,
            vendor: VENDORS.general,
            partsCost: defect === "lights" ? 850 : 3200,
            labourCost: 500,
            paidFrom: "1020",
            odometerKm: Math.round(startOdo),
          });
        }
      }

      const track = dayTrack(truck.company, truck.route, day, p, rand);
      const totals = new Map<string, DayDelta>();
      for (const ping of track) {
        const res = step(state, ping, ctx);
        state = res.state;
        for (const d of res.deltas) {
          const into = totals.get(d.day) ?? { day: d.day, km: 0, movingMin: 0, idleMin: 0, maxKmh: 0, dumpRuns: 0, speeding: 0, afterHours: 0 };
          totals.set(d.day, addDelta(into, d));
        }
        for (const e of res.events) eventRows.push(eventRow(truck.company, e));
        if (day >= trackFrom) pingRows.push({ truck: truck.id, at: new Date(ping.at), lat: ping.lat, lng: ping.lng, kmh: res.kmh ?? null });
      }
      for (const d of totals.values()) {
        dayRows.push({ truck: truck.id, company: truck.company, driver: truck.driver, ...d });
        odometer += d.km;
        sinceFill += d.km;
      }

      // Top up after roughly half a tank.
      if (sinceFill >= p.tankL * p.kmPerL * 0.5) {
        const leak = truck.id === "KBX 551P" && day >= shift(day0, -4);
        const litres = Math.round((sinceFill / (p.kmPerL * (leak ? 0.55 : 0.9 + rand() * 0.18))) * 10) / 10;
        fuel.push({
          id: `F-${++fuelSeq}`,
          company: truck.company,
          truck: truck.id,
          at: `${day} 16:${String(10 + Math.floor(rand() * 40)).padStart(2, "0")}`,
          litres,
          amount: Math.round(litres * DIESEL_KES_PER_L),
          odometerKm: Math.round(odometer),
          station: stations[Math.floor(rand() * stations.length)],
          paidFrom: rand() < 0.7 ? "1000" : "2000",
          reference: rand() < 0.7 ? `U${Math.floor(rand() * 1e9).toString(36).toUpperCase().padEnd(9, "X")}` : undefined,
          driver: truck.driver,
        });
        sinceFill = 0;
      }
    }

    // Today's checks, once the morning shift has started.
    if (!inWorkshop && nowStamp().slice(11) >= "06:30" && truck.id !== "KBX 551P") {
      const items: Record<string, CheckAnswer> = Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, "ok"]));
      const defect = truck.id === "KCZ 118M";
      if (defect) items.lights = "defect";
      inspections.push({
        company: truck.company,
        truck: truck.id,
        driver: truck.driver,
        at: `${day0} 06:${String(2 + Math.floor(rand() * 20)).padStart(2, "0")}`,
        odometerKm: Math.round(odometer),
        items,
        notes: defect ? "Left indicator not flashing." : "",
        result: defect ? "defects" : "pass",
      });
      if (defect) {
        workOrders.push({
          id: nextWo(),
          company: truck.company,
          truck: truck.id,
          kind: "defect",
          title: "Defect: Lights and indicators",
          detail: "Left indicator not flashing.",
          status: "open",
          openedAt: `${day0} 06:15`,
          openedBy: truck.driver,
          vendor: "",
          partsCost: 0,
          labourCost: 0,
          paidFrom: "1020",
          odometerKm: Math.round(odometer),
        });
      }
    }

    const lastServiceKm = Math.round(odometer - p.serviceKmAgo);
    const lastServiceDate = shift(day0, -p.serviceDaysAgo);
    workOrders.push({
      id: nextWo(),
      company: truck.company,
      truck: truck.id,
      kind: "service",
      title: "Scheduled service: oil, filters, greasing",
      detail: "Engine oil and filter, fuel filters, air filter, full greasing, brake adjustment.",
      status: "done",
      openedAt: `${lastServiceDate} 08:00`,
      openedBy: "Workshop",
      closedAt: `${lastServiceDate} 15:30`,
      vendor: VENDORS.service,
      partsCost: 26_000 + Math.round(rand() * 14) * 1000,
      labourCost: 8_000,
      paidFrom: "1010",
      odometerKm: lastServiceKm,
    });

    vehicles.push({
      truck: truck.id,
      company: truck.company,
      make: p.make,
      model: p.model,
      year: p.year,
      capacityKg: p.capacityKg,
      fuel: "diesel",
      tankL: p.tankL,
      odometerKm: odometer,
      state: inWorkshop ? "workshop" : "active",
      serviceEveryKm: 10_000,
      serviceEveryDays: 90,
      lastServiceKm,
      lastServiceDate,
      expectedKmPerL: p.kmPerL,
      telemetry: state ? { ...state } : null,
    });

    // Papers: a year's cover each, renewed at different times of year.
    const docSpecs: [string, string, number, number][] = [
      ["insurance", "POL/COM", 165_000 + Math.round(rand() * 45) * 1000, truck.id === "KCZ 118M" ? 12 : 60 + Math.floor(rand() * 270)],
      ["inspection", "NTSA/INS", 3_500, truck.id === "KCR 774L" ? -3 : 40 + Math.floor(rand() * 300)],
      ["nema", "NEMA/WTL", 15_000, truck.id === "KBX 551P" ? 25 : 90 + Math.floor(rand() * 240)],
      ["county", "NCC/WCP", 20_000, 70 + Math.floor(rand() * 250)],
    ];
    for (const [kind, prefix, cost, daysLeft] of docSpecs) {
      const expiresOn = shift(day0, daysLeft);
      documents.push({
        company: truck.company,
        subjectType: "vehicle",
        subject: truck.id,
        subjectName: truck.id,
        kind,
        number: `${prefix}/${Math.floor(10000 + rand() * 89999)}`,
        expiresOn,
        cost,
        paidFrom: "1010",
        recordedAt: `${shift(expiresOn, -365)} 10:00`,
        recordedBy: "Fleet office",
      });
    }
    const driverId = driverIds[truck.driver];
    if (driverId) {
      const licenceLeft = truck.driver === "Mary Atieno" ? 18 : 200 + Math.floor(rand() * 700);
      documents.push(
        {
          company: truck.company,
          subjectType: "driver",
          subject: driverId,
          subjectName: truck.driver,
          kind: "licence",
          number: `DL-${Math.floor(1_000_000 + rand() * 8_999_999)}`,
          expiresOn: shift(day0, licenceLeft),
          cost: 3_050,
          paidFrom: "1000",
          recordedAt: `${shift(day0, licenceLeft - 3 * 365)} 11:00`,
          recordedBy: "Fleet office",
        },
        {
          company: truck.company,
          subjectType: "driver",
          subject: driverId,
          subjectName: truck.driver,
          kind: "conduct",
          number: `CGC/${Math.floor(100000 + rand() * 899999)}`,
          expiresOn: shift(day0, 60 + Math.floor(rand() * 250)),
          cost: 1_050,
          paidFrom: "1000",
          recordedAt: `${shift(day0, -120)} 11:00`,
          recordedBy: "Fleet office",
        },
      );
    }
  }

  // Workshop jobs beyond the routine services.
  const repair = (truck: string, daysAgo: number, title: string, detail: string, vendor: string, parts: number, labour: number) => {
    const tr = trucks.find((x) => x.id === truck);
    if (!tr) return;
    const day = shift(day0, -daysAgo);
    workOrders.push({
      id: nextWo(),
      company: tr.company,
      truck,
      kind: "repair",
      title,
      detail,
      status: "done",
      openedAt: `${day} 07:30`,
      openedBy: "Fleet office",
      closedAt: `${day} 16:00`,
      vendor,
      partsCost: parts,
      labourCost: labour,
      paidFrom: "1010",
    });
  };
  repair("KDA 412X", 20, "Front brake pads and discs skimmed", "Pads at 2 mm, grinding reported by driver.", VENDORS.general, 18_500, 4_000);
  repair("KDE 907T", 12, "Burst hydraulic hose on bin lift", "Replaced hose and topped up hydraulic oil.", VENDORS.hydraulics, 9_800, 2_500);
  repair("KDG 230Q", 35, "Two rear tyres replaced", "Rear tyres worn below legal tread.", VENDORS.tyres, 62_000, 1_500);

  const gearbox = trucks.find((x) => x.id === "KCR 774L");
  if (gearbox) {
    workOrders.push({
      id: nextWo(),
      company: gearbox.company,
      truck: gearbox.id,
      kind: "repair",
      title: "Gearbox overhaul",
      detail: "Gearbox failed on Outer Ring Road; towed in. Awaiting synchro rings and bearings.",
      status: "in_progress",
      openedAt: `${shift(day0, -5)} 11:20`,
      openedBy: "Fleet office",
      vendor: VENDORS.general,
      partsCost: 145_000,
      labourCost: 25_000,
      paidFrom: "2000",
    });
  }

  const incidents: (typeof t.incidents.$inferInsert)[] = [];
  const incident = (id: string, truck: string, daysAgo: number, time: string, rest: Omit<typeof t.incidents.$inferInsert, "id" | "company" | "truck" | "driver" | "at">) => {
    const tr = trucks.find((x) => x.id === truck);
    if (tr) incidents.push({ id, company: tr.company, truck, driver: tr.driver, at: `${shift(day0, -daysAgo)} ${time}`, ...rest });
  };
  incident("INC-1001", "KCZ 118M", 9, "10:42", {
    kind: "traffic",
    severity: "minor",
    description: "Stopped by traffic police on Mombasa Road: 68 km/h in a 50 zone. Instant fine paid.",
    status: "closed",
    cost: 10_000,
  });
  incident("INC-1002", "KDA 412X", 3, "08:15", {
    kind: "accident",
    severity: "minor",
    description: "A reversing matatu scraped the nearside mirror outside Yaya Centre. No injuries.",
    policeRef: "OB 23/09/2026",
    lat: -1.2931,
    lng: 36.7876,
    status: "open",
    cost: 0,
  });
  incident("INC-1003", "KCR 774L", 5, "11:05", {
    kind: "breakdown",
    severity: "major",
    description: "Gearbox failed on Outer Ring Road near Donholm. Towed to the garage; route covered by KDG 230Q.",
    lat: -1.2958,
    lng: 36.8888,
    status: "closed",
    cost: 12_000,
  });

  await db.transaction(async (tx) => {
    await tx.insert(t.vehicles).values(vehicles);
    await tx.insert(t.fleetDocuments).values(documents);
    await insertBatched(inspections, (c) => tx.insert(t.inspections).values(c));
    await tx.insert(t.workOrders).values(workOrders);
    await insertBatched(fuel, (c) => tx.insert(t.fuelLogs).values(c));
    if (incidents.length) await tx.insert(t.incidents).values(incidents);
    await insertBatched(dayRows, (c) => tx.insert(t.fleetDays).values(c));
    await insertBatched(eventRows, (c) => tx.insert(t.fleetEvents).values(c));
    await insertBatched(pingRows, (c) => tx.insert(t.gpsPings).values(c), 1000);
  });
}

function eventRow(company: string, e: FleetEvent): typeof t.fleetEvents.$inferInsert {
  return {
    company,
    truck: e.truck,
    driver: e.driver,
    at: new Date(e.at),
    kind: e.kind,
    lat: e.lat,
    lng: e.lng,
    zone: e.zone ?? null,
    value: e.value ?? null,
  };
}
