/*
 * Turns a stream of GPS fixes from the collector's phone into what a fleet
 * manager acts on: distance, moving and idle time, speeding, movement outside
 * working hours, and arrivals at the yard, the dumpsite and service estates.
 *
 * Pure and incremental: each fix is folded into a small state kept per truck,
 * so the server does constant work per ping, and the demo seed replays whole
 * days through exactly the same code.
 */

import { distanceMeters } from "./geo";
import { zoneAt, type FleetEvent, type FleetSettings, type Ping, type Zone } from "./fleet";

export interface TelemetryState {
  at: number;
  lat: number;
  lng: number;
  zone: string | null;
  /** Start of the current stationary spell, if the truck is standing. */
  stillSince: number | null;
  stillLat?: number;
  stillLng?: number;
  lastSpeedingAt: number;
  lastAfterHoursAt: number;
}

export interface DayDelta {
  day: string;
  km: number;
  movingMin: number;
  idleMin: number;
  maxKmh: number;
  dumpRuns: number;
  speeding: number;
  afterHours: number;
}

export interface StepContext {
  truck: string;
  driver: string;
  zones: Zone[];
  settings: FleetSettings;
}

export interface StepResult {
  state: TelemetryState;
  /** Speed over the last interval; undefined for the first fix or a gap. */
  kmh?: number;
  events: FleetEvent[];
  deltas: DayDelta[];
}

/** Nairobi is UTC+3 all year. */
const EAT_MS = 3 * 3_600_000;

export const nairobiDay = (at: number) => new Date(at + EAT_MS).toISOString().slice(0, 10);

const minuteOfDay = (at: number) => Math.floor(((at + EAT_MS) / 60_000) % 1440);

const hhmm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Fixes further apart than this start a fresh trip: no distance across the gap. */
const GAP_MS = 15 * 60_000;
/** Faster than a loaded truck can go — a GPS jump, not driving. */
const JUMP_KMH = 130;
/** Below this the truck counts as standing; phone GPS wanders a few metres. */
const MOVING_KMH = 5;
const SPEEDING_REPEAT_MS = 5 * 60_000;
const AFTER_HOURS_REPEAT_MS = 30 * 60_000;

const emptyDelta = (day: string): DayDelta => ({
  day,
  km: 0,
  movingMin: 0,
  idleMin: 0,
  maxKmh: 0,
  dumpRuns: 0,
  speeding: 0,
  afterHours: 0,
});

export function step(prev: TelemetryState | null, ping: Ping, ctx: StepContext): StepResult {
  const zone = zoneAt(ctx.zones, ping);
  const events: FleetEvent[] = [];
  const ev = (kind: FleetEvent["kind"], extra: Partial<FleetEvent> = {}): FleetEvent => ({
    truck: ctx.truck,
    driver: ctx.driver,
    at: ping.at,
    kind,
    lat: ping.lat,
    lng: ping.lng,
    ...extra,
  });
  const today = emptyDelta(nairobiDay(ping.at));
  const deltas = [today];

  const fresh: TelemetryState = {
    at: ping.at,
    lat: ping.lat,
    lng: ping.lng,
    zone: zone?.id ?? null,
    stillSince: null,
    lastSpeedingAt: prev?.lastSpeedingAt ?? 0,
    lastAfterHoursAt: prev?.lastAfterHoursAt ?? 0,
  };

  // First fix, or back after a long gap: just place the truck.
  if (!prev || ping.at - prev.at > GAP_MS) {
    if (zone && zone.id !== prev?.zone) {
      events.push(ev("zone_enter", { zone: zone.name }));
      if (zone.kind === "dumpsite") today.dumpRuns++;
    }
    return { state: fresh, events, deltas };
  }
  // Out of order or duplicate: ignore it.
  if (ping.at <= prev.at) return { state: prev, events, deltas: [] };

  const seconds = (ping.at - prev.at) / 1000;
  const metres = distanceMeters(prev, ping);
  const kmh = (metres / seconds) * 3.6;
  if (kmh > JUMP_KMH) return { state: prev, events, deltas: [] };

  const moving = kmh >= MOVING_KMH;
  const state: TelemetryState = { ...prev, at: ping.at, lat: ping.lat, lng: ping.lng };
  today.maxKmh = kmh;

  if (moving) {
    today.km = metres / 1000;
    today.movingMin = seconds / 60;

    // A standing spell just ended: long enough, away from the yard and dumpsite, is idling.
    if (prev.stillSince !== null) {
      const minutes = (prev.at - prev.stillSince) / 60_000;
      const place = { lat: prev.stillLat ?? prev.lat, lng: prev.stillLng ?? prev.lng };
      const where = zoneAt(ctx.zones, place);
      if (minutes >= ctx.settings.idleMinutes && where?.kind !== "depot" && where?.kind !== "dumpsite") {
        events.push({ ...ev("idle", { value: Math.round(minutes), zone: where?.name }), at: prev.stillSince, ...place });
        const idleDay = nairobiDay(prev.stillSince);
        if (idleDay === today.day) today.idleMin = minutes;
        else deltas.push({ ...emptyDelta(idleDay), idleMin: minutes });
      }
    }
    state.stillSince = null;
    state.stillLat = undefined;
    state.stillLng = undefined;

    if (kmh > ctx.settings.speedLimitKmh && ping.at - prev.lastSpeedingAt > SPEEDING_REPEAT_MS) {
      events.push(ev("speeding", { value: Math.round(kmh) }));
      today.speeding = 1;
      state.lastSpeedingAt = ping.at;
    }

    const minute = minuteOfDay(ping.at);
    const outside = minute < hhmm(ctx.settings.dayStart) || minute >= hhmm(ctx.settings.dayEnd);
    if (outside && ping.at - prev.lastAfterHoursAt > AFTER_HOURS_REPEAT_MS) {
      events.push(ev("after_hours"));
      today.afterHours = 1;
      state.lastAfterHoursAt = ping.at;
    }
  } else if (prev.stillSince === null) {
    state.stillSince = prev.at;
    state.stillLat = prev.lat;
    state.stillLng = prev.lng;
  }

  const zoneId = zone?.id ?? null;
  if (zoneId !== prev.zone) {
    const left = prev.zone ? ctx.zones.find((z) => z.id === prev.zone) : undefined;
    if (left) events.push(ev("zone_exit", { zone: left.name }));
    if (zone) {
      events.push(ev("zone_enter", { zone: zone.name }));
      if (zone.kind === "dumpsite") today.dumpRuns = 1;
    }
    state.zone = zoneId;
  }

  return { state, kmh, events, deltas };
}

/** Adds a step's deltas into running day totals. */
export function addDelta<T extends DayDelta>(into: T, d: DayDelta): T {
  into.km += d.km;
  into.movingMin += d.movingMin;
  into.idleMin += d.idleMin;
  into.maxKmh = Math.max(into.maxKmh, d.maxKmh);
  into.dumpRuns += d.dumpRuns;
  into.speeding += d.speeding;
  into.afterHours += d.afterHours;
  return into;
}
