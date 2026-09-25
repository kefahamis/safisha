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
  from: TicketAuthor;
  text: string;
  at: string;
}

export interface Ticket {
  id: string;
  client: string;
  company: string;
  cat: string;
  subject: string;
  status: TicketStatus;
  msgs: TicketMessage[];
}

export interface Pickup {
  client: string;
  when: string;
  truck: string;
  status: string;
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
  txn?: Txn;
}

export type StatementPeriod = "all" | "2026-07" | "2026-08" | "2026-09";

export interface AppState {
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

  /** Next sequence number per company+estate pair, for issuing client numbers. */
  seq: Record<string, number>;

  clients: Client[];
  trucks: Truck[];
  txns: Txn[];
  tickets: Ticket[];
  pickups: Pickup[];
  suspense: SuspenseItem[];
  /** truckId -> clientId -> status, for today's route sheet. */
  stops: Record<string, Record<string, StopStatus>>;

  stk: StkSession | null;

  /** Milliseconds advanced by the ticker since the demo clock started. */
  elapsedMs: number;
}
