import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/*
 * The platform's database. Domain dates (payments, pickups, messages) are kept as
 * "YYYY-MM-DD HH:mm" strings in Nairobi time, the form the whole app already
 * reads and compares; system records use real timestamptz columns.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ---------------- access ---------------- */

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  workspace: text("workspace").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  system: boolean("system").notNull().default(false),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  name: text("name").notNull(),
  roleId: text("role_id").notNull(),
  scope: jsonb("scope").$type<{ companyId?: string; clientId?: string; truckId?: string; departmentId?: string }>().notNull().default({}),
  grants: jsonb("grants").$type<string[]>().notNull().default([]),
  denies: jsonb("denies").$type<string[]>().notNull().default([]),
  suspended: boolean("suspended").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  lang: text("lang").notNull().default("en"),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
  /** Set once they've proved they can read mail at this address. */
  emailVerifiedAt: text("email_verified_at"),
  /** One-time codes for when every other method is lost; stored as digests. */
  recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
});

/** A second step someone has set up: SMS, email, an authenticator app or a passkey. */
export const userFactors = pgTable("user_factors", {
  id: serial("id").primaryKey(),
  user: text("user").notNull(),
  method: text("method").notNull(), // sms | email | totp | passkey
  label: text("label").notNull(),
  /** Masked phone or email, or the device, for the list. */
  detail: text("detail").notNull().default(""),
  /** Authenticator secret, encrypted at rest. */
  secret: text("secret"),
  /** Passkey: credential id and public key (base64url), signature counter, transports. */
  credentialId: text("credential_id"),
  publicKey: text("public_key"),
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  /** Empty while being set up; a factor counts only once confirmed. */
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

/** One-time codes: password resets, staff invites and phone sign-in. */
export const authCodes = pgTable("auth_codes", {
  id: serial("id").primaryKey(),
  purpose: text("purpose").notNull(), // reset | invite | otp
  userId: text("user_id"),
  target: text("target").notNull(), // email or phone the code went to
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- operations ---------------- */

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  estate: text("estate").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  plan: integer("plan").notNull(),
  phone: text("phone").notNull(),
  joined: text("joined").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  lang: text("lang").notNull().default("en"),
});

/** Next sequence number per company+estate, for issuing client numbers. */
export const clientSeq = pgTable("client_seq", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});

export const trucks = pgTable("trucks", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  driver: text("driver").notNull(),
  route: jsonb("route").$type<string[]>().notNull(),
  d: doublePrecision("d").notNull().default(0),
  speed: doublePrecision("speed").notNull().default(90),
  status: text("status").notNull().default("route"),
  sharing: boolean("sharing").notNull().default(true),
  lastSeen: text("last_seen"),
  /** Real GPS from the collector's phone, when it has reported one. */
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  gpsAt: timestamp("gps_at", { withTimezone: true }),
});

export const txns = pgTable("txns", {
  id: text("id").primaryKey(),
  client: text("client").notNull(),
  date: text("date").notNull(),
  kind: text("kind").notNull(), // charge | payment
  amount: integer("amount").notNull(),
  desc: text("desc").notNull(),
  channel: text("channel"),
  payer: text("payer"),
});

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(),
  client: text("client").notNull(),
  company: text("company").notNull(),
  cat: text("cat").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  priority: text("priority").notNull().default("normal"),
  /** Where it came in: app, phone, ussd, walk_in, crew, email. */
  channel: text("channel").notNull().default("app"),
  /** The staff member handling it. */
  assignee: text("assignee"),
  resolvedAt: text("resolved_at"),
});

/** What happened to a ticket on the desk: assignment, priority, status. Clients never see these. */
export const ticketEvents = pgTable("ticket_events", {
  id: serial("id").primaryKey(),
  ticket: text("ticket").notNull(),
  at: text("at").notNull(),
  actor: text("actor").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticket: text("ticket").notNull(),
  from: text("from").notNull(), // client | agent | sys | note (desk only)
  /** The staff member who wrote an agent reply or a note. */
  author: text("author"),
  text: text("text").notNull(),
  at: text("at").notNull(),
  photo: text("photo"),
  /** Cached translations, keyed by target language. */
  translations: jsonb("translations").$type<Record<string, unknown>>().notNull().default({}),
});

export const pickups = pgTable("pickups", {
  id: serial("id").primaryKey(),
  client: text("client").notNull(),
  when: text("when").notNull(),
  truck: text("truck").notNull(),
  status: text("status").notNull(),
  weightKg: doublePrecision("weight_kg"),
  stream: text("stream"), // mixed | recyclable | organic | residual
  photo: text("photo"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

/** Today's route sheet: one row per truck, client and day. */
export const stops = pgTable(
  "stops",
  {
    truck: text("truck").notNull(),
    client: text("client").notNull(),
    day: text("day").notNull(),
    status: text("status").notNull(), // Collected | Skipped
    at: text("at").notNull(),
    photo: text("photo"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    weightKg: doublePrecision("weight_kg"),
    stream: text("stream"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.truck, t.client, t.day] })],
);

/** A driver's chosen stop order for the day, from the route optimiser. */
export const routeOrders = pgTable(
  "route_orders",
  {
    truck: text("truck").notNull(),
    day: text("day").notNull(),
    order: jsonb("order").$type<string[]>().notNull(),
    distanceM: integer("distance_m").notNull(),
    baselineM: integer("baseline_m").notNull(),
  },
  (t) => [primaryKey({ columns: [t.truck, t.day] })],
);

export const suspense = pgTable("suspense", {
  id: text("id").primaryKey(),
  account: text("account").notNull(),
  amount: integer("amount").notNull(),
  payer: text("payer").notNull(),
  date: text("date").notNull(),
  company: text("company").notNull(),
  reason: text("reason").notNull(),
});

/** On-demand pickups a client books and pays for. */
export const pickupRequests = pgTable("pickup_requests", {
  id: text("id").primaryKey(),
  client: text("client").notNull(),
  company: text("company").notNull(),
  kind: text("kind").notNull(),
  notes: text("notes").notNull().default(""),
  preferredDate: text("preferred_date").notNull(),
  price: integer("price").notNull(),
  status: text("status").notNull(), // Requested | Scheduled | Completed | Cancelled
  paid: boolean("paid").notNull().default(false),
  truck: text("truck"),
  scheduledFor: text("scheduled_for"),
  photo: text("photo"),
  createdAt: text("created_at").notNull(),
});

/** Resident reports of illegal dumping. */
export const dumpReports = pgTable("dump_reports", {
  id: text("id").primaryKey(),
  reporter: text("reporter").notNull(), // client id or phone
  company: text("company"),
  estate: text("estate"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  description: text("description").notNull(),
  size: text("size").notNull().default("small"),
  photo: text("photo"),
  status: text("status").notNull(), // New | Assigned | Cleared
  createdAt: text("created_at").notNull(),
  clearedAt: text("cleared_at"),
});

/** Photos: proof of collection, dumping reports, pickup requests. */
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  owner: text("owner").notNull(),
  company: text("company"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- accounting ---------------- */

/**
 * Manual journal entries: expenses, capital, adjustments. Billing and M-Pesa
 * postings are derived from txns and suspense rather than stored twice.
 */
export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(), // JE-1001
  company: text("company").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  memo: text("memo").notNull(),
  reference: text("reference"),
  /** Set on an entry that undoes another; entries are reversed, never edited. */
  reverses: text("reverses"),
  postedBy: text("posted_by").notNull(),
  postedByName: text("posted_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  entry: text("entry").notNull(),
  account: text("account").notNull(),
  debit: integer("debit").notNull().default(0),
  credit: integer("credit").notNull().default(0),
  memo: text("memo"),
});

/* ---------------- payments ---------------- */

/** Every STK Push we start, live or simulated, and how it ended. */
export const stkRequests = pgTable("stk_requests", {
  id: text("id").primaryKey(), // CheckoutRequestID (live) or a local id
  merchantRequestId: text("merchant_request_id"),
  company: text("company").notNull(),
  client: text("client").notNull(),
  phone: text("phone").notNull(),
  amount: integer("amount").notNull(),
  purpose: text("purpose").notNull().default("account"), // account | pickup:<id>
  mode: text("mode").notNull(), // live | simulated
  status: text("status").notNull(), // pending | success | failed
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  receipt: text("receipt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- integrations ---------------- */

/**
 * Integration settings. `scope` is "platform" or a company id. Secret fields are
 * stored AES-GCM encrypted in `secrets`; `config` holds the non-secret rest.
 */
export const settings = pgTable(
  "settings",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secrets: jsonb("secrets").$type<Record<string, string>>().notNull().default({}),
    status: text("status").notNull().default("unconfigured"), // unconfigured | ok | error
    statusDetail: text("status_detail"),
    testedAt: timestamp("tested_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

/** Every SMS we send or would have sent. */
export const smsOutbox = pgTable("sms_outbox", {
  id: serial("id").primaryKey(),
  company: text("company"),
  to: text("to").notNull(),
  body: text("body").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(), // sent | simulated | failed
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Which billing-reminder stage each client has been sent, per month. */
export const reminderLog = pgTable(
  "reminder_log",
  {
    client: text("client").notNull(),
    month: text("month").notNull(),
    stage: text("stage").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    detail: text("detail"),
  },
  (t) => [primaryKey({ columns: [t.client, t.month, t.stage] })],
);

/** Who changed what. Secret values are never written here. */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  actorName: text("actor_name").notNull(),
  company: text("company"),
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  /** Where the request came from, as the proxy reported it. */
  ip: text("ip"),
});

/* ---------------- fleet management ---------------- */

/** The vehicle register: one row per truck, beside its live position in `trucks`. */
export const vehicles = pgTable("vehicles", {
  truck: text("truck").primaryKey(),
  company: text("company").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  capacityKg: integer("capacity_kg").notNull(),
  fuel: text("fuel").notNull().default("diesel"),
  tankL: integer("tank_l").notNull(),
  odometerKm: doublePrecision("odometer_km").notNull(),
  state: text("state").notNull().default("active"), // active | workshop | off_road
  serviceEveryKm: integer("service_every_km").notNull(),
  serviceEveryDays: integer("service_every_days").notNull(),
  lastServiceKm: doublePrecision("last_service_km").notNull(),
  lastServiceDate: text("last_service_date").notNull(),
  expectedKmPerL: doublePrecision("expected_km_per_l").notNull(),
  /** Where the GPS stream left off; see lib/telemetry. */
  telemetry: jsonb("telemetry").$type<Record<string, unknown>>(),
});

/** Insurance, inspection and licences for vehicles and drivers. A renewal is a new row. */
export const fleetDocuments = pgTable("fleet_documents", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  subjectType: text("subject_type").notNull(), // vehicle | driver
  subject: text("subject").notNull(), // plate or user id
  subjectName: text("subject_name").notNull(),
  kind: text("kind").notNull(),
  number: text("number").notNull().default(""),
  expiresOn: text("expires_on").notNull(),
  cost: integer("cost").notNull().default(0),
  paidFrom: text("paid_from").notNull().default("1010"),
  recordedAt: text("recorded_at").notNull(),
  recordedBy: text("recorded_by").notNull(),
});

/** The start-of-day walk-round. */
export const inspections = pgTable("inspections", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  truck: text("truck").notNull(),
  driver: text("driver").notNull(),
  at: text("at").notNull(),
  odometerKm: doublePrecision("odometer_km").notNull(),
  items: jsonb("items").$type<Record<string, string>>().notNull(),
  notes: text("notes").notNull().default(""),
  photo: text("photo"),
  result: text("result").notNull(), // pass | defects
});

export const workOrders = pgTable("work_orders", {
  id: text("id").primaryKey(), // WO-1001
  company: text("company").notNull(),
  truck: text("truck").notNull(),
  kind: text("kind").notNull(), // service | repair | defect
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  status: text("status").notNull(), // open | in_progress | done | cancelled
  openedAt: text("opened_at").notNull(),
  openedBy: text("opened_by").notNull(),
  closedAt: text("closed_at"),
  inspection: integer("inspection"),
  /** Raised by a failed safety-critical check item: the truck stays off the road until it's done. */
  critical: boolean("critical").notNull().default(false),
  vendor: text("vendor").notNull().default(""),
  partsCost: integer("parts_cost").notNull().default(0),
  labourCost: integer("labour_cost").notNull().default(0),
  paidFrom: text("paid_from").notNull().default("1010"),
  odometerKm: doublePrecision("odometer_km"),
});

export const fuelLogs = pgTable("fuel_logs", {
  id: text("id").primaryKey(), // F-1001
  company: text("company").notNull(),
  truck: text("truck").notNull(),
  at: text("at").notNull(),
  litres: doublePrecision("litres").notNull(),
  amount: integer("amount").notNull(),
  odometerKm: doublePrecision("odometer_km").notNull(),
  station: text("station").notNull().default(""),
  paidFrom: text("paid_from").notNull(),
  reference: text("reference"),
  driver: text("driver").notNull(),
  photo: text("photo"),
});

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(), // INC-1001
  company: text("company").notNull(),
  truck: text("truck").notNull(),
  driver: text("driver").notNull(),
  at: text("at").notNull(),
  kind: text("kind").notNull(),
  severity: text("severity").notNull(), // minor | major
  description: text("description").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  photo: text("photo"),
  policeRef: text("police_ref"),
  status: text("status").notNull(), // open | closed
  cost: integer("cost").notNull().default(0),
});

/** Every GPS fix a collector's phone sends, for trip playback. */
export const gpsPings = pgTable("gps_pings", {
  id: serial("id").primaryKey(),
  truck: text("truck").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  kmh: doublePrecision("kmh"),
}, (t) => [index("gps_pings_truck_at").on(t.truck, t.at)]);

/** Speeding, idling, after-hours movement and geofence crossings. */
export const fleetEvents = pgTable("fleet_events", {
  id: serial("id").primaryKey(),
  company: text("company").notNull(),
  truck: text("truck").notNull(),
  driver: text("driver").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  kind: text("kind").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  zone: text("zone"),
  value: doublePrecision("value"),
}, (t) => [index("fleet_events_company_at").on(t.company, t.at)]);

/** Running totals per truck and day, kept as positions arrive. */
export const fleetDays = pgTable(
  "fleet_days",
  {
    truck: text("truck").notNull(),
    day: text("day").notNull(),
    company: text("company").notNull(),
    driver: text("driver").notNull(),
    km: doublePrecision("km").notNull().default(0),
    movingMin: doublePrecision("moving_min").notNull().default(0),
    idleMin: doublePrecision("idle_min").notNull().default(0),
    maxKmh: doublePrecision("max_kmh").notNull().default(0),
    dumpRuns: integer("dump_runs").notNull().default(0),
    speeding: integer("speeding").notNull().default(0),
    afterHours: integer("after_hours").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.truck, t.day] })],
);

/* ---------------- staff ---------------- */

/** Teams inside a company. Staff in a department carry its permissions. */
export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});
