// Server-only. The slice of the database one session may see.
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Session } from "@/lib/auth/types";
import { GPS_FRESH_MS } from "@/lib/geo";
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
import { companyUsersWith } from "./accessStore";
import { brandingFor } from "./branding";
import { checksToday, fleetAlerts } from "./fleet";
import { getDb, schema } from "./db";
import { demoMode } from "./demo";
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


/**
 * What a member of staff receives, by permission. The menus already hide what
 * someone can't open; this keeps the data itself out of their browser too, so
 * the workshop never downloads client phone numbers and the care desk never
 * downloads the books. Clients and collectors are limited by who they are.
 */
export function staffShares(permissions: string[]) {
  const any = (...ids: string[]) => ids.some((p) => permissions.includes(p));
  return {
    /** Client records at all (names, estates, gate locations). */
    clients: any(
      "clients.view", "payments.view", "statements.view", "finance.view", "reminders.manage", "tickets.view.company",
      "pickups.manage", "dumping.manage", "fleet.view", "fleet.manage", "platform.clients", "platform.overview", "platform.fleet",
    ),
    /** Phone numbers. */
    contact: any("clients.view", "tickets.view.company", "reminders.manage", "pickups.manage", "platform.clients"),
    /** Plans, charges and payments. */
    money: any("clients.view", "payments.view", "statements.view", "finance.view", "reminders.manage", "platform.clients", "platform.overview"),
    tickets: any("tickets.view.company"),
    suspense: any("payments.view", "payments.reconcile"),
    /** Collection history, today's stops and route plans. */
    collections: any("clients.view", "fleet.view", "fleet.manage", "pickups.manage", "platform.fleet", "platform.overview"),
    requests: any("pickups.manage", "clients.view", "platform.overview"),
    dumping: any("dumping.manage", "clients.view", "platform.overview"),
  };
}

const EVERYTHING: ReturnType<typeof staffShares> = {
  clients: true, contact: true, money: true, tickets: true, suspense: true, collections: true, requests: true, dumping: true,
};

/** Clients and collectors are already limited to their own slice; staff by permission. */
const sharesFor = (session: Session) => (session.ws === "company" || session.ws === "admin" ? staffShares(session.permissions) : EVERYTHING);

/**
 * A token for everything the snapshot depends on: the counters of the scopes
 * this session reads (bumped by database triggers on every write), the day,
 * and who is asking with what permissions. Same token, same snapshot.
 */
export async function snapshotVersion(session: Session, companies?: string[] | null): Promise<string> {
  const db = await getDb();
  const visible = companies === undefined ? await visibleCompanies(session) : companies;
  let scopes: string[] | null;
  if (session.ws === "client") {
    scopes = ["*", `cl:${session.scope.clientId ?? ""}`, `pub:${visible?.[0] ?? ""}`];
  } else {
    scopes = visible === null ? null : ["*", ...visible.map((c) => `co:${c}`)];
  }
  const [row] = await db
    .select({ v: sql<string>`coalesce(sum(${t.dataVersions.version}), 0)::text` })
    .from(t.dataVersions)
    .where(scopes ? inArray(t.dataVersions.scope, scopes) : undefined);
  const who = createHash("sha256")
    .update(JSON.stringify([session.sub, session.ws, session.scope, [...session.permissions].sort(), demoMode()]))
    .digest("base64url")
    .slice(0, 12);
  return `${today()}.${who}.${row?.v ?? "0"}`;
}

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
  // Read before the data, so a write landing mid-build makes the next poll fetch again.
  const version = await snapshotVersion(session, companies);
  const share = sharesFor(session);
  const clientOnly = session.ws === "client" ? session.scope.clientId ?? "__none__" : null;
  const inCompanies = (col: AnyPgColumn) =>
    companies === null ? undefined : inArray(col, companies.length ? companies : ["__none__"]);

  // Clients: a client sees only themselves; a collector the clients on their truck's route.
  let clientRows = share.clients
    ? await db
        .select()
        .from(t.clients)
        .where(clientOnly ? eq(t.clients.id, clientOnly) : inCompanies(t.clients.company))
    : [];

  const truckRows = await db.select().from(t.trucks).where(inCompanies(t.trucks.company));

  if (session.ws === "collector" && session.scope.truckId) {
    const truck = truckRows.find((x) => x.id === session.scope.truckId);
    const route = new Set(truck?.route ?? []);
    clientRows = clientRows.filter((c) => route.has(c.estate));
  }
  const clientIds = clientRows.map((c) => c.id);
  const ids = clientIds.length ? clientIds : ["__none__"];
  const truckIds = truckRows.map((x) => x.id).concat("__none__");

  const [txnRows, ticketRows, pickupRows, suspenseRows, stopRows, orderRows, requestRows, dumpRows] =
    await Promise.all([
      share.money ? db.select().from(t.txns).where(inArray(t.txns.client, ids)) : Promise.resolve([]),
      session.ws === "collector" || !share.tickets
        ? Promise.resolve([])
        : db.select().from(t.tickets).where(
            clientOnly ? eq(t.tickets.client, clientOnly) : inCompanies(t.tickets.company),
          ),
      share.collections
        ? db.select().from(t.pickups).where(inArray(t.pickups.client, ids)).orderBy(desc(t.pickups.when))
        : Promise.resolve([]),
      clientOnly || session.ws === "collector" || !share.suspense
        ? Promise.resolve([])
        : db.select().from(t.suspense).where(inCompanies(t.suspense.company)),
      share.collections
        ? db
            .select()
            .from(t.stops)
            .where(and(eq(t.stops.day, day), inArray(t.stops.truck, truckIds)))
        : Promise.resolve([]),
      share.collections
        ? db
            .select()
            .from(t.routeOrders)
            .where(and(eq(t.routeOrders.day, day), inArray(t.routeOrders.truck, truckIds)))
        : Promise.resolve([]),
      share.requests
        ? db
            .select()
            .from(t.pickupRequests)
            .where(clientOnly ? eq(t.pickupRequests.client, clientOnly) : inCompanies(t.pickupRequests.company))
            .orderBy(desc(t.pickupRequests.createdAt))
        : Promise.resolve([]),
      share.dumping
        ? db
            .select()
            .from(t.dumpReports)
            .where(
              clientOnly
                ? eq(t.dumpReports.reporter, clientOnly)
                : companies === null
                  ? undefined
                  : // Reports in the company's estates, plus any its own clients filed elsewhere.
                    or(
                      inArray(t.dumpReports.company, companies.length ? companies : ["__none__"]),
                      inArray(t.dumpReports.reporter, ids),
                    ),
            )
            .orderBy(desc(t.dumpReports.createdAt))
        : Promise.resolve([]),
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
    plan: share.money ? c.plan : 0,
    phone: share.contact ? c.phone : "",
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

  // The desk sees internal notes, history and who has each ticket; a client sees only the conversation.
  const desk = session.ws !== "client";
  const eventRows =
    desk && ticketRows.length
      ? await db
          .select()
          .from(t.ticketEvents)
          .where(inArray(t.ticketEvents.ticket, ticketRows.map((x) => x.id)))
          .orderBy(t.ticketEvents.id)
      : [];
  const assigneeIds = [...new Set(ticketRows.map((x) => x.assignee).filter((x): x is string => Boolean(x)))];
  const assigneeRows =
    desk && assigneeIds.length
      ? await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(inArray(t.users.id, assigneeIds))
      : [];

  const tickets: Ticket[] = ticketRows.map((tk) => {
    const mine = msgRows.filter((m) => m.ticket === tk.id);
    return {
      id: tk.id,
      client: tk.client,
      company: tk.company,
      cat: tk.cat,
      subject: tk.subject,
      status: tk.status as Ticket["status"],
      createdAt: tk.createdAt,
      priority: tk.priority as Ticket["priority"],
      channel: tk.channel,
      resolvedAt: tk.resolvedAt ?? undefined,
      msgs: mine
        .filter((m) => m.from !== "note")
        .map((m) => ({
          id: m.id,
          from: m.from as Ticket["msgs"][number]["from"],
          text: m.text,
          at: m.at,
          photo: m.photo ?? undefined,
        })),
      ...(desk
        ? {
            assignee: tk.assignee ?? undefined,
            assigneeName: assigneeRows.find((u) => u.id === tk.assignee)?.name,
            notes: mine
              .filter((m) => m.from === "note")
              .map((m) => ({ id: m.id, by: m.author ?? "Staff", text: m.text, at: m.at })),
            events: eventRows
              .filter((e) => e.ticket === tk.id)
              .map((e) => ({ id: e.id, at: e.at, actorName: e.actorName, action: e.action, detail: e.detail })),
          }
        : {}),
    };
  });

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

  const agents =
    session.ws === "company" && companies?.length === 1 && session.permissions.includes("tickets.view.company")
      ? await companyUsersWith(companies[0], "tickets.view.company")
      : [];

  // Fleet: managers see their company's alerts; a driver sees their own truck's.
  const fleet: AppData["fleet"] = { checks: {}, alerts: [] };
  if (session.ws === "collector" && session.scope.truckId && session.scope.companyId) {
    fleet.checks = await checksToday([session.scope.truckId]);
    fleet.alerts = (await fleetAlerts(session.scope.companyId, session.scope.truckId)).filter(
      (a) => a.kind !== "fuel" && a.kind !== "driving",
    );
  } else if (session.ws === "company" && companies?.length === 1 && session.permissions.includes("fleet.manage")) {
    fleet.checks = await checksToday(truckRows.map((x) => x.id));
    fleet.alerts = await fleetAlerts(companies[0]);
  }
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
      demo: demoMode(),
    },
    fleet,
    agents,
    branding: await brandingFor(companyIds),
    serverNow: now,
    version,
  };
}
