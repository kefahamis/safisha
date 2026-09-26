/*
 * The ticketing side of customer care: priority, the response deadline it
 * sets, where a ticket came from, and who it's with. The conversation itself
 * is the care chat; this is the desk's view of it.
 */

import type { Ticket } from "./types";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export const PRIORITIES: { key: TicketPriority; label: string; hours: number }[] = [
  { key: "urgent", label: "Urgent", hours: 4 },
  { key: "high", label: "High", hours: 8 },
  { key: "normal", label: "Normal", hours: 24 },
  { key: "low", label: "Low", hours: 72 },
];

export const priorityLabel = (p: string) => PRIORITIES.find((x) => x.key === p)?.label ?? p;

export type TicketChannel = "app" | "phone" | "ussd" | "walk_in" | "crew" | "email";

export const CHANNELS: { key: TicketChannel; label: string }[] = [
  { key: "app", label: "App" },
  { key: "phone", label: "Phone call" },
  { key: "ussd", label: "USSD" },
  { key: "walk_in", label: "Walk-in" },
  { key: "crew", label: "Collection crew" },
  { key: "email", label: "Email" },
];

export const channelLabel = (c: string) => CHANNELS.find((x) => x.key === c)?.label ?? c;

/** "2026-09-25 10:15" (Nairobi) to epoch ms. */
const toMs = (stamp: string) => Date.parse(`${stamp.replace(" ", "T")}:00+03:00`);

const toStamp = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

/** When the ticket should be resolved by, from its priority. */
export function dueAt(t: Pick<Ticket, "createdAt" | "priority">): string {
  const hours = PRIORITIES.find((p) => p.key === t.priority)?.hours ?? 24;
  return toStamp(toMs(t.createdAt) + hours * 3_600_000);
}

/** Past its deadline and still not resolved. */
export const isOverdue = (t: Pick<Ticket, "createdAt" | "priority" | "status">, now: string) =>
  t.status !== "Resolved" && dueAt(t) < now;

/** Minutes from the client's first message to the desk's first reply, if there has been one. */
export function firstResponseMinutes(t: Pick<Ticket, "msgs" | "createdAt">): number | undefined {
  const reply = t.msgs.find((m) => m.from === "agent");
  if (!reply) return undefined;
  return Math.max(0, Math.round((toMs(reply.at) - toMs(t.createdAt)) / 60_000));
}

/** "3 h 20 min" or "45 min" or "2 days". */
export function duration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m >= 2880) return `${Math.round(m / 1440)} days`;
  if (m >= 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return `${m} min`;
}

/** Minutes between two stamps (b − a). */
export const minutesBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / 60_000);

/** Who a ticket is waiting on: the desk (client spoke last) or the client. */
export const waitingOn = (t: Pick<Ticket, "msgs">): "desk" | "client" =>
  t.msgs[t.msgs.length - 1]?.from === "client" ? "desk" : "client";

export const EVENT_TEXT: Record<string, string> = {
  created: "Opened the ticket",
  status: "Changed status",
  priority: "Changed priority",
  assign: "Assigned",
  category: "Changed category",
  note: "Added an internal note",
};
