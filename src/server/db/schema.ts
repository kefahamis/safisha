import {
  boolean,
  customType,
  doublePrecision,
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
  scope: jsonb("scope").$type<{ companyId?: string; clientId?: string; truckId?: string }>().notNull().default({}),
  grants: jsonb("grants").$type<string[]>().notNull().default([]),
  denies: jsonb("denies").$type<string[]>().notNull().default([]),
  suspended: boolean("suspended").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  lang: text("lang").notNull().default("en"),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
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
});

export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticket: text("ticket").notNull(),
  from: text("from").notNull(), // client | agent | sys
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
});
