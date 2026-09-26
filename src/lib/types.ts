import type { Branding } from "./branding";
import type { FleetAlert, Inspection } from "./fleet";
import type { TicketPriority } from "./tickets";

export type Role = "client" | "company" | "collector" | "admin";

export type ClientType = "Household" | "Business";

/** A WGS84 point, the order Leaflet expects. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Estate {
  /** Three-letter estate code used inside client numbers, e.g. KIL. */
  code: string;
  name: string;
  /** Approximate centroid of the estate. */
  lat: number;
  lng: number;
  /** Rough extent in metres, drawn as the service-area circle. */
  radius: number;
  /** Collection weekdays, 0 = Sunday. */
  days: number[];
}

export interface Company {
  /** Two-letter company code used as the client number prefix. */
  id: string;
  name: string;
  paybill: string;
  care: string;
  hours: string;
  color: string;
  estates: string[];
}

export interface Client {
  id: string;
  company: string;
  estate: string;
  name: string;
  type: ClientType;
  plan: number;
  phone: string;
  joined: string;
  /** The collection point — a gate, near the estate centroid. */
  lat: number;
  lng: number;
}

export type TruckStatus = "route" | "offline";

export interface Truck {
  id: string;
  company: string;
  driver: string;
  /** Estate codes visited in a loop. */
  route: string[];
  /** Distance travelled along the loop, in metres. */
  d: number;
  /** Metres advanced per tick (one second). */
  speed: number;
  status: TruckStatus;
  sharing: boolean;
  lastSeen?: string;
  /** Real GPS from the collector's phone, when recent enough to trust. */
  gps?: { lat: number; lng: number; at: string };
}

export type TxnKind = "charge" | "payment";

export interface Txn {
  id: string;
  client: string;
  date: string;
  kind: TxnKind;
  amount: number;
  desc: string;
  channel?: string;
  payer?: string;
}

export type TicketStatus = "Open" | "Pending" | "Resolved";
export type TicketAuthor = "client" | "agent" | "sys";

export interface TicketMessage {
  id?: number;
  from: TicketAuthor;
  text: string;
  at: string;
  /** A photo attached to the message, e.g. proof from the crew. */
  photo?: string;
}

export interface Ticket {
  id: string;
  client: string;
  company: string;
  cat: string;
  subject: string;
  status: TicketStatus;
  /** The conversation with the client. */
  msgs: TicketMessage[];
  /** "YYYY-MM-DD HH:mm" */
  createdAt: string;
  priority: TicketPriority;
  channel: string;
  /** The staff member handling it (user id), and their name. */
  assignee?: string;
  assigneeName?: string;
  resolvedAt?: string;
  /** Desk only: notes the client never sees, and what happened to the ticket. */
  notes?: TicketNote[];
  events?: TicketEvent[];
}

export interface TicketNote {
  id?: number;
  by: string;
  text: string;
  at: string;
}

export interface TicketEvent {
  id: number;
  at: string;
  actorName: string;
  action: string;
  detail: Record<string, unknown>;
}

/** Someone who can take tickets, for the assignee picker. */
export interface CareAgent {
  id: string;
  name: string;
}

export type WasteStream = "mixed" | "recyclable" | "organic" | "residual";

export interface Pickup {
  client: string;
  when: string;
  truck: string;
  status: string;
  weightKg?: number;
  stream?: WasteStream;
  photo?: string;
}

/** Evidence captured at a stop: photo, where and when, and what was collected. */
export interface StopProof {
  status: StopStatus;
  at: string;
  photo?: string;
  lat?: number;
  lng?: number;
  weightKg?: number;
  stream?: WasteStream;
  note?: string;
}

export type PickupRequestStatus = "Requested" | "Scheduled" | "Completed" | "Cancelled";

export interface PickupRequest {
  id: string;
  client: string;
  company: string;
  kind: string;
  notes: string;
  preferredDate: string;
  price: number;
  status: PickupRequestStatus;
  paid: boolean;
  truck?: string;
  scheduledFor?: string;
  photo?: string;
  createdAt: string;
}

export type DumpStatus = "New" | "Assigned" | "Cleared";

export interface DumpReport {
  id: string;
  reporter: string;
  company?: string;
  estate?: string;
  lat: number;
  lng: number;
  description: string;
  size: "small" | "medium" | "large";
  photo?: string;
  status: DumpStatus;
  createdAt: string;
  clearedAt?: string;
}

export interface RouteOrder {
  order: string[];
  distanceM: number;
  baselineM: number;
}

export interface PriceItem {
  kind: string;
  price: number;
}

/** What each integration is doing right now, as the UI needs to know it. */
export interface IntegrationStatus {
  /** Per company: live Daraja, or the built-in simulator. */
  mpesa: Record<string, { mode: "live" | "simulated"; environment?: string; shortcode?: string }>;
  sms: "live" | "simulated";
  translate: boolean;
}

export interface SuspenseItem {
  id: string;
  account: string;
  amount: number;
  payer: string;
  date: string;
  company: string;
  reason: string;
}

export type StopStatus = "Collected" | "Skipped";

export type StkStep = "form" | "phone" | "wait" | "done" | "declined";

export interface StkSession {
  step: StkStep;
  client: string;
  phone: string;
  amount: number;
  /** What the payment is for: the account, or an on-demand pickup. */
  purpose: string;
  /** Set once the prompt is sent; the server's id for the request. */
  requestId?: string;
  mode?: "live" | "simulated";
  error?: string;
  txn?: Txn;
}

export type StatementPeriod = "all" | "2026-07" | "2026-08" | "2026-09";

/** Everything the server persists, narrowed to what this session may see. */
export interface AppData {
  clients: Client[];
  trucks: Truck[];
  txns: Txn[];
  tickets: Ticket[];
  pickups: Pickup[];
  suspense: SuspenseItem[];
  /** truckId -> clientId -> status, for today's route sheet. */
  stops: Record<string, Record<string, StopStatus>>;
  /** "truckId|clientId" -> evidence for today's stops. */
  proofs: Record<string, StopProof>;
  routeOrders: Record<string, RouteOrder>;
  pickupRequests: PickupRequest[];
  dumpReports: DumpReport[];
  pricing: Record<string, PriceItem[]>;
  integrations: IntegrationStatus;
  /** Staff who can take tickets, for assigning them; empty outside the care desk. */
  agents: CareAgent[];
  /** Today's vehicle checks and what needs attention, for fleet managers and drivers. */
  fleet: {
    /** truckId -> today's latest check. */
    checks: Record<string, { at: string; result: Inspection["result"]; defects: string[] }>;
    alerts: FleetAlert[];
  };
  /** Logo and colours per company in view; unbranded companies are absent. */
  branding: Record<string, Branding>;
  /** Server time when this snapshot was taken (epoch ms). */
  serverNow: number;
}

export interface AppState extends AppData {
  /** Selected identity per role. The active role itself comes from the URL. */
  companyId: string;
  clientId: string;
  truckId: string;

  /** View-local UI state that must survive navigation. */
  q: string;
  estateFilter: string;
  stmtPeriod: StatementPeriod;
  stmtClient: string | null;
  selTicket: string | null;

  stk: StkSession | null;

  /** Milliseconds the ticker has advanced since `serverNow`. */
  elapsedMs: number;
  /** Commands waiting to reach the server (the collector app works offline). */
  pending: number;
  online: boolean;
}
