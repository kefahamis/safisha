import type {
  ClientType,
  DumpReport,
  DumpStatus,
  PickupRequestStatus,
  StopStatus,
  TicketStatus,
  WasteStream,
} from "./types";

/*
 * Every change the app makes goes to the server as one of these. The server
 * checks permission and scope, applies it in a transaction, and answers with a
 * fresh snapshot — so the UI never holds data the server didn't confirm.
 */

export interface StopProofInput {
  photo?: string;
  lat?: number;
  lng?: number;
  weightKg?: number;
  stream?: WasteStream;
  note?: string;
}

export type Command =
  | { type: "fleet.setSharing"; truck: string; sharing: boolean }
  | { type: "fleet.gps"; truck: string; lat: number; lng: number }
  | { type: "route.mark"; truck: string; client: string; status: StopStatus; proof?: StopProofInput }
  | { type: "route.undo"; truck: string; client: string }
  | { type: "route.optimise"; truck: string }
  | { type: "ticket.create"; client: string; cat: string; subject: string; message: string }
  | { type: "ticket.reply"; ticket: string; from: "client" | "agent"; text: string }
  | { type: "ticket.status"; ticket: string; status: TicketStatus }
  | {
      type: "client.add";
      company: string;
      name: string;
      phone: string;
      estate: string;
      clientType: ClientType;
      plan: number;
    }
  | { type: "stk.start"; client: string; phone: string; amount: number; purpose: string }
  | { type: "stk.simulate"; request: string; approve: boolean }
  | { type: "c2b.simulate"; company: string; account: string; amount: number; phone: string }
  | { type: "suspense.assign"; id: string; client: string }
  | {
      type: "pickup.request";
      client: string;
      kind: string;
      notes: string;
      preferredDate: string;
      photo?: string;
    }
  | {
      type: "pickup.update";
      id: string;
      status?: PickupRequestStatus;
      truck?: string | null;
      scheduledFor?: string | null;
    }
  | {
      type: "dump.report";
      lat: number;
      lng: number;
      description: string;
      size: DumpReport["size"];
      photo?: string;
    }
  | { type: "dump.update"; id: string; status: DumpStatus; company?: string | null }
  | { type: "user.lang"; lang: "en" | "sw" };

export type CommandType = Command["type"];

/** What a command hands back besides the snapshot. */
export type CommandResult =
  | { ok: true; id?: string; message?: string; mode?: "live" | "simulated"; data?: unknown }
  | { ok: false; error: string };
