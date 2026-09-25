import { demoNow } from "./clock";
import { DAYS, MONTHS } from "./format";
import { companyById } from "./reference/companies";
import { ESTATES } from "./reference/estates";
import type { AppState, Client, Truck, Txn } from "./types";

export const nowIn = (s: AppState) => demoNow(s.elapsedMs);

export const clientById = (s: AppState, id: string | null): Client | undefined =>
  s.clients.find((c) => c.id === id);

export const truckById = (s: AppState, id: string): Truck | undefined =>
  s.trucks.find((t) => t.id === id);

export const ticketById = (s: AppState, id: string | null) =>
  s.tickets.find((t) => t.id === id);

/** A client's ledger, oldest first. */
export const txFor = (s: AppState, id: string): Txn[] =>
  s.txns.filter((t) => t.client === id).sort((a, b) => a.date.localeCompare(b.date));

/** Positive = owed to the company, negative = credit carried forward. */
export const balance = (s: AppState, id: string): number =>
  txFor(s, id).reduce((b, t) => b + (t.kind === "charge" ? t.amount : -t.amount), 0);

export const outstandingFor = (s: AppState, clients: Client[]): number =>
  clients.reduce((a, c) => a + Math.max(0, balance(s, c.id)), 0);

export const clientsOf = (s: AppState, companyId: string) =>
  s.clients.filter((c) => c.company === companyId);

export const trucksOf = (s: AppState, companyId: string) =>
  s.trucks.filter((t) => t.company === companyId);

export const lastPickup = (s: AppState, id: string) =>
  s.pickups.filter((p) => p.client === id).sort((a, b) => b.when.localeCompare(a.when))[0];

/** "Today" / "Tomorrow" / "Thu 1 Oct" for the next scheduled collection day. */
export function nextPickup(s: AppState, c: Client): string {
  const days = ESTATES[c.estate].days;
  const base = new Date(nowIn(s));
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const x = new Date(base);
    x.setDate(base.getDate() + i);
    if (days.includes(x.getDay())) {
      if (i === 0) return "Today";
      if (i === 1) return "Tomorrow";
      return `${DAYS[x.getDay()]} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
    }
  }
  return "—";
}

export const collectionDays = (c: Client) =>
  ESTATES[c.estate].days.map((d) => DAYS[d]).join(" & ");

/** The truck whose route covers this client's estate. */
export const truckForClient = (s: AppState, c: Client) =>
  s.trucks.find((t) => t.company === c.company && t.route.includes(c.estate));

export interface TruckState {
  label: string;
  cls: "ok" | "warn" | "neutral";
}

export function truckState(t: Truck): TruckState {
  if (t.status === "offline") return { label: "Offline", cls: "neutral" };
  if (!t.sharing) return { label: "Location paused", cls: "warn" };
  return { label: "On route", cls: "ok" };
}

/** Total charged or paid by one company's clients in a given month. */
export const monthSum = (
  s: AppState,
  companyId: string,
  kind: Txn["kind"],
  month = "2026-09",
): number =>
  s.txns
    .filter(
      (t) =>
        t.kind === kind &&
        t.date.startsWith(month) &&
        clientById(s, t.client)?.company === companyId,
    )
    .reduce((a, t) => a + t.amount, 0);

export const paymentsOf = (s: AppState, companyId: string) =>
  s.txns
    .filter((t) => t.kind === "payment" && clientById(s, t.client)?.company === companyId)
    .sort((a, b) => b.date.localeCompare(a.date));

export const openTicketCount = (s: AppState, filter: (t: AppState["tickets"][number]) => boolean) =>
  s.tickets.filter((t) => filter(t) && t.status !== "Resolved").length;

/** Company care desk details, re-exported so views need one import. */
export const companyOf = (c: Client) => companyById(c.company);
