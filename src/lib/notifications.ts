import { kes, stamp } from "./format";
import { companyById } from "./reference/companies";
import { clientById, nowIn } from "./selectors";
import type { AppState, Role } from "./types";

export type NotificationKind = "ticket" | "pickup" | "dumping" | "payment";

export interface AppNotification {
  /** Stable per event — a new ticket message or status change gets a new id. */
  id: string;
  kind: NotificationKind;
  /** An i18n key, filled from `vars`. */
  title: string;
  vars?: Record<string, string>;
  body: string;
  /** "2026-09-25 10:15" */
  at: string;
  href: string;
}

/** Older events drop off the feed rather than piling up as unread forever. */
const WINDOW_DAYS = 14;
const LIMIT = 30;

const clientName = (s: AppState, id: string) => clientById(s, id)?.name ?? id;

/**
 * The events that need this person's attention, derived from the live store
 * snapshot — so the feed updates on every sync without a separate channel.
 */
export function notificationsFor(s: AppState, role: Role): AppNotification[] {
  const out: AppNotification[] = [];
  const since = stamp(new Date(nowIn(s).getTime() - WINDOW_DAYS * 86_400_000));

  if (role === "client") {
    const me = s.clientId;
    for (const t of s.tickets) {
      const last = t.msgs[t.msgs.length - 1];
      if (t.client !== me || t.status === "Resolved" || !last || last.from === "client") continue;
      out.push({
        id: `ticket:${t.id}:${t.msgs.length}`,
        kind: "ticket",
        title: "Customer care replied",
        body: t.subject,
        at: last.at,
        href: "/client/support",
      });
    }
    for (const r of s.pickupRequests) {
      if (r.client !== me || (r.status !== "Scheduled" && r.status !== "Completed")) continue;
      out.push({
        id: `pickup:${r.id}:${r.status}`,
        kind: "pickup",
        title: r.status === "Scheduled" ? "Pickup scheduled" : "Pickup completed",
        body: r.scheduledFor ? `${r.kind} · ${r.scheduledFor}` : r.kind,
        at: r.createdAt,
        href: "/client/pickups",
      });
    }
    for (const x of s.txns) {
      if (x.client !== me || x.kind !== "payment") continue;
      out.push({
        id: `payment:${x.id}`,
        kind: "payment",
        title: "Payment received",
        body: `${kes(x.amount)}${x.channel ? ` via ${x.channel}` : ""}`,
        at: x.date,
        href: "/client/statement",
      });
    }
    for (const d of s.dumpReports) {
      if (d.reporter !== me || d.status !== "Cleared") continue;
      out.push({
        id: `dumping:${d.id}:Cleared`,
        kind: "dumping",
        title: "Dumping site cleared",
        body: d.description,
        at: d.clearedAt ?? d.createdAt,
        href: "/client/report",
      });
    }
  }

  if (role === "company") {
    const co = s.companyId;
    for (const t of s.tickets) {
      const last = t.msgs[t.msgs.length - 1];
      if (t.company !== co || t.status === "Resolved" || !last || last.from !== "client") continue;
      out.push({
        id: `ticket:${t.id}:${t.msgs.length}`,
        kind: "ticket",
        title: "Message from {name}",
        vars: { name: clientName(s, t.client) },
        body: t.subject,
        at: last.at,
        href: "/company/support",
      });
    }
    for (const r of s.pickupRequests) {
      if (r.company !== co || r.status !== "Requested") continue;
      out.push({
        id: `pickup:${r.id}:Requested`,
        kind: "pickup",
        title: "New pickup request",
        body: `${r.kind} · ${clientName(s, r.client)}`,
        at: r.createdAt,
        href: "/company/pickups",
      });
    }
    for (const d of s.dumpReports) {
      if (d.status !== "New") continue;
      const ours = d.company === co;
      // A client of ours may report dumping in another company's estate: we hear of it too.
      const byOurClient = clientById(s, d.reporter)?.company === co;
      if (!ours && !byOurClient) continue;
      out.push({
        id: `dumping:${d.id}:New`,
        kind: "dumping",
        title: ours ? "Illegal dumping reported" : "Your client reported dumping",
        body: ours || !d.company ? d.description : `${d.description} · handled by ${companyById(d.company).name}`,
        at: d.createdAt,
        href: "/company/dumping",
      });
    }
    for (const p of s.suspense) {
      if (p.company !== co) continue;
      out.push({
        id: `payment:${p.id}`,
        kind: "payment",
        title: "Unmatched payment",
        body: `${kes(p.amount)} from ${p.payer} · ${p.reason}`,
        at: p.date,
        href: "/company/payments",
      });
    }
  }

  if (role === "admin") {
    for (const d of s.dumpReports) {
      if (d.status !== "New") continue;
      out.push({
        id: `dumping:${d.id}:New`,
        kind: "dumping",
        title: "Illegal dumping reported",
        body: d.description,
        at: d.createdAt,
        href: "/admin/dumping",
      });
    }
  }

  if (role === "collector") {
    for (const r of s.pickupRequests) {
      if (r.truck !== s.truckId || r.status !== "Scheduled") continue;
      out.push({
        id: `pickup:${r.id}:Scheduled`,
        kind: "pickup",
        title: "Pickup added to your route",
        body: `${r.kind} · ${clientName(s, r.client)}${r.scheduledFor ? ` · ${r.scheduledFor}` : ""}`,
        at: r.createdAt,
        href: "/collector",
      });
    }
  }

  return out
    .filter((n) => n.at >= since)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LIMIT);
}
