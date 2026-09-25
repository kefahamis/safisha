// Server-only. The slice of the database one session may see.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Session } from "@/lib/auth/types";
import { COMPANIES } from "@/lib/reference/companies";
import type {
  AppData,
  Client,
  DumpReport,
  PickupRequest,
  StopProof,
  StopStatus,
  Ticket,
  Truck,
  WasteStream,
} from "@/lib/types";
import { getDb, schema } from "./db";
import { smsLive } from "./integrations/messaging";
import { translateAvailable } from "./integrations/translate";
import { liveMpesa } from "./payments";
import { priceList } from "./settings";
import { today } from "./time";

const t = schema;

/*
 * Simulated trucks drive by the clock: distance = stored d + speed × seconds
 * since this epoch. Pausing stores the distance reached; resuming re-anchors
 * it, so a truck neither jumps nor drifts across refreshes.
 */
export const SIM_EPOCH = Date.UTC(2026, 8, 25, 7, 15);

export function simDistance(row: { d: number; speed: number; status: string; sharing: boolean }, now = Date.now()) {
  if (row.status === "offline" || !row.sharing) return row.d;
  return row.d + (row.speed * (now - SIM_EPOCH)) / 1000;
}

/** Real GPS older than this is ignored in favour of the simulated position. */
const GPS_FRESH_MS = 3 * 60_000;

/** Which companies this session can see; null means all of them. */
export async function visibleCompanies(session: Session): Promise<string[] | null> {
  if (session.scope.companyId) return [session.scope.companyId];
  if (session.scope.clientId) {
    const db = await getDb();
    const [c] = await db.select({ company: t.clients.company }).from(t.clients).where(eq(t.clients.id, session.scope.clientId));
    return c ? [c.company] : [];
  }
  // Staff with no company scope (the platform admin) see every company.
  return session.permissions.some((p) => p.startsWith("platform.")) ? null : [];
}

export async function buildSnapshot(session: Session): Promise<AppData> {
  const db = await getDb();
  const now = Date.now();
  const day = today();
  const companies = await visibleCompanies(session);
  const clientOnly = session.ws === "client" ? session.scope.clientId ?? "__none__" : null;
  const inCompanies = (col: AnyPgColumn) =>
    companies === null ? undefined : inArray(col, companies.length ? companies : ["__none__"]);

  // Clients: a client sees only themselves; a collector the clients on their truck's route.
  let clientRows = await db
    .select()
    .from(t.clients)
    .where(clientOnly ? eq(t.clients.id, clientOnly) : inCompanies(t.clients.company));

  const truckRows = await db.select().from(t.trucks).where(inCompanies(t.trucks.company));

  if (session.ws === "collector" && session.scope.truckId) {
    const truck = truckRows.find((x) => x.id === session.scope.truckId);
    const route = new Set(truck?.route ?? []);
    clientRows = clientRows.filter((c) => route.has(c.estate));
  }
  const clientIds = clientRows.map((c) => c.id);
  const ids = clientIds.length ? clientIds : ["__none__"];

  const [txnRows, ticketRows, pickupRows, suspenseRows, stopRows, orderRows, requestRows, dumpRows] =
    await Promise.all([
      db.select().from(t.txns).where(inArray(t.txns.client, ids)),
      session.ws === "collector"
        ? Promise.resolve([])
        : db.select().from(t.tickets).where(
            clientOnly ? eq(t.tickets.client, clientOnly) : inCompanies(t.tickets.company),
          ),
      db.select().from(t.pickups).where(inArray(t.pickups.client, ids)).orderBy(desc(t.pickups.when)),
      clientOnly || session.ws === "collector"
        ? Promise.resolve([])
        : db.select().from(t.suspense).where(inCompanies(t.suspense.company)),
      db
        .select()
        .from(t.stops)
        .where(
          and(eq(t.stops.day, day), inArray(t.stops.truck, truckRows.map((x) => x.id).concat("__none__"))),
        ),
      db.select().from(t.routeOrders).where(eq(t.routeOrders.day, day)),
      db
        .select()
        .from(t.pickupRequests)
        .where(clientOnly ? eq(t.pickupRequests.client, clientOnly) : inCompanies(t.pickupRequests.company))
        .orderBy(desc(t.pickupRequests.createdAt)),
      db
        .select()
        .from(t.dumpReports)
        .where(
          clientOnly
            ? eq(t.dumpReports.reporter, clientOnly)
            : companies === null
              ? undefined
              : inArray(t.dumpReports.company, companies.length ? companies : ["__none__"]),
        )
        .orderBy(desc(t.dumpReports.createdAt)),
    ]);

  const msgRows = ticketRows.length
    ? await db
        .select()
        .from(t.ticketMessages)
        .where(inArray(t.ticketMessages.ticket, ticketRows.map((x) => x.id)))
        .orderBy(t.ticketMessages.id)
    : [];

  const clientsOut: Client[] = clientRows.map((c) => ({
    id: c.id,
    company: c.company,
    estate: c.estate,
    name: c.name,
    type: c.type as Client["type"],
    plan: c.plan,
    phone: c.phone,
    joined: c.joined,
    lat: c.lat,
    lng: c.lng,
  }));

  const trucksOut: Truck[] = truckRows.map((x) => ({
    id: x.id,
    company: x.company,
    driver: x.driver,
    route: x.route,
    d: simDistance(x, now),
    speed: x.speed,
    status: x.status as Truck["status"],
    sharing: x.sharing,
    lastSeen: x.lastSeen ?? undefined,
    gps:
      x.gpsLat !== null && x.gpsLng !== null && x.gpsAt && now - x.gpsAt.getTime() < GPS_FRESH_MS
        ? { lat: x.gpsLat, lng: x.gpsLng, at: x.gpsAt.toISOString() }
        : undefined,
  }));

  const tickets: Ticket[] = ticketRows.map((tk) => ({
    id: tk.id,
    client: tk.client,
    company: tk.company,
    cat: tk.cat,
    subject: tk.subject,
    status: tk.status as Ticket["status"],
    msgs: msgRows
      .filter((m) => m.ticket === tk.id)
      .map((m) => ({
        id: m.id,
        from: m.from as Ticket["msgs"][number]["from"],
        text: m.text,
        at: m.at,
        photo: m.photo ?? undefined,
      })),
  }));

  const stops: AppData["stops"] = {};
  const proofs: AppData["proofs"] = {};
  for (const tr of truckRows) stops[tr.id] = {};
  for (const s of stopRows) {
    (stops[s.truck] ??= {})[s.client] = s.status as StopStatus;
    const proof: StopProof = {
      status: s.status as StopStatus,
      at: s.at,
      photo: s.photo ?? undefined,
      lat: s.lat ?? undefined,
      lng: s.lng ?? undefined,
      weightKg: s.weightKg ?? undefined,
      stream: (s.stream as WasteStream) ?? undefined,
      note: s.note ?? undefined,
    };
    proofs[`${s.truck}|${s.client}`] = proof;
  }

  const routeOrders: AppData["routeOrders"] = {};
  for (const o of orderRows) {
    if (truckRows.some((x) => x.id === o.truck)) {
      routeOrders[o.truck] = { order: o.order, distanceM: o.distanceM, baselineM: o.baselineM };
    }
  }

  const pickupRequests: PickupRequest[] = requestRows.map((r) => ({
    id: r.id,
    client: r.client,
    company: r.company,
    kind: r.kind,
    notes: r.notes,
    preferredDate: r.preferredDate,
    price: r.price,
    status: r.status as PickupRequest["status"],
    paid: r.paid,
    truck: r.truck ?? undefined,
    scheduledFor: r.scheduledFor ?? undefined,
    photo: r.photo ?? undefined,
    createdAt: r.createdAt,
  }));

  const dumpReports: DumpReport[] = dumpRows.map((d) => ({
    id: d.id,
    reporter: d.reporter,
    company: d.company ?? undefined,
    estate: d.estate ?? undefined,
    lat: d.lat,
    lng: d.lng,
    description: d.description,
    size: d.size as DumpReport["size"],
    photo: d.photo ?? undefined,
    status: d.status as DumpReport["status"],
    createdAt: d.createdAt,
    clearedAt: d.clearedAt ?? undefined,
  }));

  const companyIds = companies ?? COMPANIES.map((c) => c.id);
  const pricing: AppData["pricing"] = {};
  const mpesa: AppData["integrations"]["mpesa"] = {};
  for (const id of companyIds) {
    const prices = await priceList(id);
    pricing[id] = Object.entries(prices).map(([kind, price]) => ({ kind, price }));
    const live = await liveMpesa(id);
    mpesa[id] = live
      ? { mode: "live", environment: live.config.environment, shortcode: live.config.shortcode }
      : { mode: "simulated" };
  }

  return {
    clients: clientsOut,
    trucks: trucksOut,
    txns: txnRows.map((x) => ({
      id: x.id,
      client: x.client,
      date: x.date,
      kind: x.kind as "charge" | "payment",
      amount: x.amount,
      desc: x.desc,
      channel: x.channel ?? undefined,
      payer: x.payer ?? undefined,
    })),
    tickets,
    pickups: pickupRows.map((p) => ({
      client: p.client,
      when: p.when,
      truck: p.truck,
      status: p.status,
      weightKg: p.weightKg ?? undefined,
      stream: (p.stream as WasteStream) ?? undefined,
      photo: p.photo ?? undefined,
    })),
    suspense: suspenseRows,
    stops,
    proofs,
    routeOrders,
    pickupRequests,
    dumpReports,
    pricing,
    integrations: {
      mpesa,
      sms: (await smsLive()) ? "live" : "simulated",
      translate: await translateAvailable(),
    },
    serverNow: now,
  };
}
