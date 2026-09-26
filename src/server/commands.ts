// Server-only. Applies one command for one session, after checking it's allowed.
import { and, eq, like } from "drizzle-orm";
import type { Session } from "@/lib/auth/types";
import { luhn, normalisePhone, KE_MOBILE } from "@/lib/clientNumber";
import type { Command, CommandResult } from "@/lib/commands";
import { fmtDate, kes, MONTHS, pad } from "@/lib/format";
import { INVOICE_STATUS_LABEL, invoicesFor } from "@/lib/invoices";
import { CHANNELS, PRIORITIES, priorityLabel } from "@/lib/tickets";
import {
  DOC_KINDS,
  defectsOf,
  hasCriticalDefect,
  INCIDENT_KINDS,
  PAYMENT_ACCOUNTS,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
} from "@/lib/fleet";
import { distanceMeters, offsetPoint, truckPos } from "@/lib/geo";
import { PICKUP_KINDS } from "@/lib/integrations";
import { companyById, companyForEstate } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { optimiseRoute, tourLength } from "@/lib/routeOpt";
import type { Truck } from "@/lib/types";
import { companyUsersWith } from "./accessStore";
import { audit } from "./audit";
import {
  cleanCheckItems,
  companyDrivers,
  lastConfirmedOdometer,
  nextFleetId,
  recordPing,
  refreshVehicleState,
  saveFleetSettings,
} from "./fleet";
import { getDb, schema, type Db } from "./db";
import { HttpError } from "./session";
import { sendSms } from "./integrations/messaging";
import { demoMode } from "./demo";
import { nextClientSeq, nextPrefixedId } from "./ids";
import { settleStk, simulatePaybill, startStk } from "./payments";
import { priceList } from "./settings";
import { SIM_EPOCH, simDistance, visibleCompanies } from "./snapshot";
import { nowStamp, today } from "./time";

const t = schema;

class Denied extends Error {}
const deny = (message = "You can't do that.") => {
  throw new Denied(message);
};

function need(session: Session, ...perms: string[]) {
  const missing = perms.filter((p) => !session.permissions.includes(p));
  if (missing.length) deny(`Missing permission: ${missing.join(", ")}`);
}

async function canSeeCompany(session: Session, company: string) {
  const companies = await visibleCompanies(session);
  return companies === null || companies.includes(company);
}

async function requireCompany(session: Session, company: string) {
  if (!(await canSeeCompany(session, company))) deny("That belongs to another company.");
}

/** The session's own truck — collectors only act on the truck they drive. */
function requireOwnTruck(session: Session, truck: string) {
  if (session.scope.truckId === truck) return;
  if (!session.scope.companyId && session.permissions.includes("platform.fleet")) return;
  deny("You can only update your own truck.");
}

/**
 * Daily checks, fuel and incidents: the driver for their own truck, or the
 * office for any truck in its company.
 */
async function requireTruckRecords(session: Session, truck: { id: string; company: string }) {
  if (session.permissions.includes("fleet.manage")) return requireCompany(session, truck.company);
  need(session, "fleet.inspect");
  requireOwnTruck(session, truck.id);
}

const isPaymentAccount = (code: string) => PAYMENT_ACCOUNTS.some((a) => a.code === code);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN);

/** A line in a ticket's desk history. */
async function ticketEvent(db: Db, ticket: string, actor: { sub: string; name: string }, action: string, detail: Record<string, unknown> = {}) {
  await db.insert(t.ticketEvents).values({ ticket, at: nowStamp(), actor: actor.sub, actorName: actor.name, action, detail });
}

/** Someone on this company's desk: they must be able to see its tickets. */
async function requireAgent(company: string, user: string) {
  const agents = await companyUsersWith(company, "tickets.view.company");
  const agent = agents.find((a) => a.id === user);
  if (!agent) deny("Pick someone on the care desk.");
  return agent!;
}

async function getClient(db: Db, id: string) {
  const [c] = await db.select().from(t.clients).where(eq(t.clients.id, id));
  return c ?? null;
}

async function getTruck(db: Db, id: string) {
  const [x] = await db.select().from(t.trucks).where(eq(t.trucks.id, id));
  return x ?? null;
}

const nextTicketId = (db: Db) => nextPrefixedId(db, t.tickets, "T-", 1045);

const truckPosition = (row: typeof t.trucks.$inferSelect) =>
  row.gpsLat !== null && row.gpsLng !== null && row.gpsAt && Date.now() - row.gpsAt.getTime() < 3 * 60_000
    ? { lat: row.gpsLat, lng: row.gpsLng }
    : truckPos({ ...(row as unknown as Truck), d: simDistance(row) });

export async function runCommand(session: Session, cmd: Command): Promise<CommandResult> {
  try {
    return await apply(session, cmd);
  } catch (err) {
    if (err instanceof Denied) return { ok: false, error: err.message };
    throw err;
  }
}

async function apply(session: Session, cmd: Command): Promise<CommandResult> {
  const db = await getDb();
  const at = nowStamp();

  switch (cmd.type) {
    /* ---------------- fleet ---------------- */

    case "fleet.setSharing": {
      need(session, "route.share_location");
      requireOwnTruck(session, cmd.truck);
      const row = await getTruck(db, cmd.truck);
      if (!row) return { ok: false, error: "No such truck." };
      // Freeze the distance reached, or re-anchor it so the truck resumes from there.
      const reached = simDistance(row);
      const d = cmd.sharing ? reached - (row.speed * (Date.now() - SIM_EPOCH)) / 1000 : reached;
      await db
        .update(t.trucks)
        .set({ sharing: cmd.sharing, status: cmd.sharing ? "route" : row.status, d, lastSeen: at })
        .where(eq(t.trucks.id, cmd.truck));
      return { ok: true };
    }

    case "fleet.gps": {
      need(session, "route.share_location");
      requireOwnTruck(session, cmd.truck);
      if (!(Math.abs(cmd.lat) <= 90 && Math.abs(cmd.lng) <= 180)) return { ok: false, error: "Bad position." };
      await db
        .update(t.trucks)
        .set({ gpsLat: cmd.lat, gpsLng: cmd.lng, gpsAt: new Date(), lastSeen: at })
        .where(eq(t.trucks.id, cmd.truck));
      const truck = await getTruck(db, cmd.truck);
      if (truck) await recordPing(truck, cmd.lat, cmd.lng);
      return { ok: true };
    }

    /* ---------------- route sheet ---------------- */

    case "route.mark": {
      need(session, "route.complete");
      requireOwnTruck(session, cmd.truck);
      const [truck, client] = await Promise.all([getTruck(db, cmd.truck), getClient(db, cmd.client)]);
      if (!truck || !client || client.company !== truck.company) return { ok: false, error: "Not on this route." };
      const p = cmd.proof ?? {};
      const weight = typeof p.weightKg === "number" && p.weightKg >= 0 && p.weightKg < 20000 ? p.weightKg : null;

      await db.transaction(async (tx) => {
        await tx
          .insert(t.stops)
          .values({
            truck: cmd.truck,
            client: cmd.client,
            day: today(),
            status: cmd.status,
            at,
            photo: p.photo ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
            weightKg: weight,
            stream: p.stream ?? null,
            note: p.note?.slice(0, 300) ?? null,
          })
          .onConflictDoUpdate({
            target: [t.stops.truck, t.stops.client, t.stops.day],
            set: { status: cmd.status, at, photo: p.photo ?? null, weightKg: weight, stream: p.stream ?? null },
          });

        if (cmd.status === "Collected") {
          await tx.insert(t.pickups).values({
            client: cmd.client,
            when: at,
            truck: cmd.truck,
            status: "Collected",
            weightKg: weight,
            stream: p.stream ?? null,
            photo: p.photo ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
          });
          return;
        }

        // A skipped stop opens a care ticket, with the crew's photo as evidence.
        const id = await nextTicketId(tx as unknown as Db);
        await tx.insert(t.tickets).values({
          id,
          client: client.id,
          company: client.company,
          cat: "Missed pickup",
          subject: "Crew could not access your gate",
          status: "Open",
          createdAt: at,
          channel: "crew",
        });
        await tx.insert(t.ticketMessages).values({
          ticket: id,
          from: "agent",
          text: `Our crew on ${cmd.truck} could not access your gate at ${at.slice(11)}.${
            p.note ? ` Crew note: ${p.note.slice(0, 200)}.` : ""
          } Reply here to arrange a return visit.`,
          at,
          photo: p.photo ?? null,
        });
      });

      if (cmd.status === "Skipped") {
        await sendSms({
          to: client.phone,
          company: client.company,
          purpose: "missed-pickup",
          body: `${companyById(client.company).name}: our crew could not access your gate today at ${at.slice(11)}. Reply in the app or call ${companyById(client.company).care} to arrange a return visit.`,
        });
      }
      return { ok: true };
    }

    case "route.undo": {
      need(session, "route.complete");
      requireOwnTruck(session, cmd.truck);
      const day = today();
      await db.transaction(async (tx) => {
        await tx
          .delete(t.stops)
          .where(and(eq(t.stops.truck, cmd.truck), eq(t.stops.client, cmd.client), eq(t.stops.day, day)));
        await tx
          .delete(t.pickups)
          .where(
            and(eq(t.pickups.client, cmd.client), eq(t.pickups.truck, cmd.truck), like(t.pickups.when, `${day}%`)),
          );
      });
      return { ok: true };
    }

    case "route.optimise": {
      need(session, "route.view");
      requireOwnTruck(session, cmd.truck);
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      const estates = [...new Set(truck.route)];
      const all = await db.select().from(t.clients).where(eq(t.clients.company, truck.company));
      const baseline = estates.flatMap((e) => all.filter((c) => c.estate === e));
      if (baseline.length < 2) return { ok: false, error: "Not enough stops to reorder." };
      const start = truckPosition(truck);
      const best = optimiseRoute(start, baseline);
      const baselineM = Math.round(tourLength(start, baseline));
      const distanceM = Math.round(best.distanceM);
      await db
        .insert(t.routeOrders)
        .values({ truck: cmd.truck, day: today(), order: best.order, distanceM, baselineM })
        .onConflictDoUpdate({
          target: [t.routeOrders.truck, t.routeOrders.day],
          set: { order: best.order, distanceM, baselineM },
        });
      const saved = Math.max(0, baselineM - distanceM);
      return {
        ok: true,
        message: saved > 50 ? `Route reordered: about ${(saved / 1000).toFixed(1)} km shorter.` : "Route is already close to the shortest order.",
      };
    }

    /* ---------------- customer care ---------------- */

    case "ticket.create": {
      need(session, "tickets.view.own");
      if (session.scope.clientId !== cmd.client) deny("You can only open requests for your own account.");
      const client = await getClient(db, cmd.client);
      if (!client) return { ok: false, error: "No such account." };
      const subject = cmd.subject.trim().slice(0, 80);
      const message = cmd.message.trim().slice(0, 2000);
      if (!subject || !message) return { ok: false, error: "Write a message first." };
      const cat = cmd.cat.slice(0, 40);
      let id = "";
      await db.transaction(async (tx) => {
        id = await nextTicketId(tx as unknown as Db);
        await tx.insert(t.tickets).values({
          id,
          client: client.id,
          company: client.company,
          cat,
          subject,
          status: "Open",
          createdAt: at,
        });
        await tx.insert(t.ticketMessages).values([
          { ticket: id, from: "client", text: message, at },
          {
            ticket: id,
            from: "sys",
            text: `Ticket ${id} created. ${companyById(client.company).name} usually replies within 2 hours.`,
            at,
          },
        ]);
      });
      await ticketEvent(db, id, { sub: session.sub, name: client.name }, "created", { channel: "app" });
      return { ok: true, id };
    }

    case "ticket.reply": {
      need(session, "tickets.reply");
      const [ticket] = await db.select().from(t.tickets).where(eq(t.tickets.id, cmd.ticket));
      if (!ticket) return { ok: false, error: "No such conversation." };
      if (cmd.from === "client") {
        if (session.scope.clientId !== ticket.client) deny();
      } else {
        if (session.ws === "client") deny();
        await requireCompany(session, ticket.company);
      }
      const text = cmd.text.trim().slice(0, 2000);
      if (!text) return { ok: false, error: "Write a message first." };

      await db
        .insert(t.ticketMessages)
        .values({ ticket: ticket.id, from: cmd.from, text, at, author: cmd.from === "agent" ? session.name : null });
      if (cmd.from === "agent" && !ticket.assignee && session.permissions.includes("tickets.view.company")) {
        await db.update(t.tickets).set({ assignee: session.sub }).where(eq(t.tickets.id, ticket.id));
        await ticketEvent(db, ticket.id, session, "assign", { to: session.name, auto: true });
      }
      const status =
        cmd.from === "agent" && ticket.status === "Open"
          ? "Pending"
          : cmd.from === "client" && ticket.status === "Resolved"
            ? "Open"
            : ticket.status;
      if (status !== ticket.status) {
        await db
          .update(t.tickets)
          .set({ status, resolvedAt: status === "Resolved" ? at : null })
          .where(eq(t.tickets.id, ticket.id));
      }

      if (cmd.from === "agent") {
        const client = await getClient(db, ticket.client);
        if (client) {
          await sendSms({
            to: client.phone,
            company: client.company,
            purpose: "care-reply",
            body: `${companyById(client.company).name} care (${ticket.id}): ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`,
          });
        }
      }
      return { ok: true };
    }

    case "ticket.status": {
      need(session, "tickets.status");
      const [ticket] = await db.select().from(t.tickets).where(eq(t.tickets.id, cmd.ticket));
      if (!ticket) return { ok: false, error: "No such conversation." };
      await requireCompany(session, ticket.company);
      if (!["Open", "Pending", "Resolved"].includes(cmd.status)) return { ok: false, error: "Unknown status." };
      if (cmd.status === ticket.status) return { ok: true };
      await db
        .update(t.tickets)
        .set({ status: cmd.status, resolvedAt: cmd.status === "Resolved" ? at : null })
        .where(eq(t.tickets.id, ticket.id));
      await db.insert(t.ticketMessages).values({
        ticket: ticket.id,
        from: "sys",
        text: `Status changed to ${cmd.status}`,
        at,
      });
      await ticketEvent(db, ticket.id, session, "status", { from: ticket.status, to: cmd.status });
      return { ok: true };
    }

    case "ticket.update": {
      need(session, "tickets.status");
      const [ticket] = await db.select().from(t.tickets).where(eq(t.tickets.id, cmd.ticket));
      if (!ticket) return { ok: false, error: "No such ticket." };
      await requireCompany(session, ticket.company);
      const set: Partial<typeof t.tickets.$inferInsert> = {};
      const events: [string, Record<string, unknown>][] = [];
      if (cmd.priority !== undefined && cmd.priority !== ticket.priority) {
        if (!PRIORITIES.some((p) => p.key === cmd.priority)) return { ok: false, error: "Unknown priority." };
        set.priority = cmd.priority;
        events.push(["priority", { from: priorityLabel(ticket.priority), to: priorityLabel(cmd.priority) }]);
      }
      if (cmd.assignee !== undefined && cmd.assignee !== ticket.assignee) {
        if (cmd.assignee === null) {
          set.assignee = null;
          events.push(["assign", { to: null }]);
        } else {
          const agent = await requireAgent(ticket.company, cmd.assignee);
          set.assignee = agent.id;
          events.push(["assign", { to: agent.name }]);
        }
      }
      if (cmd.cat !== undefined && cmd.cat.trim() && cmd.cat !== ticket.cat) {
        set.cat = cmd.cat.trim().slice(0, 40);
        events.push(["category", { from: ticket.cat, to: set.cat }]);
      }
      if (!events.length) return { ok: true };
      await db.update(t.tickets).set(set).where(eq(t.tickets.id, ticket.id));
      for (const [action, detail] of events) await ticketEvent(db, ticket.id, session, action, detail);
      return { ok: true, message: `${ticket.id} updated.` };
    }

    case "ticket.note": {
      need(session, "tickets.reply", "tickets.view.company");
      const [ticket] = await db.select().from(t.tickets).where(eq(t.tickets.id, cmd.ticket));
      if (!ticket) return { ok: false, error: "No such ticket." };
      await requireCompany(session, ticket.company);
      const text = cmd.text.trim().slice(0, 2000);
      if (!text) return { ok: false, error: "Write the note first." };
      // Stored beside the conversation but never sent to the client.
      await db.insert(t.ticketMessages).values({ ticket: ticket.id, from: "note", text, at, author: session.name });
      return { ok: true, message: "Note added. Only staff can see it." };
    }

    case "ticket.open": {
      need(session, "tickets.reply", "tickets.view.company");
      const client = await getClient(db, cmd.client);
      if (!client) return { ok: false, error: "Pick the client." };
      await requireCompany(session, client.company);
      const subject = cmd.subject.trim().slice(0, 80);
      const message = cmd.message.trim().slice(0, 2000);
      if (!subject || !message) return { ok: false, error: "Give the ticket a subject and describe the request." };
      if (!PRIORITIES.some((p) => p.key === cmd.priority)) return { ok: false, error: "Pick a priority." };
      if (!CHANNELS.some((c) => c.key === cmd.channel)) return { ok: false, error: "Pick how they got in touch." };
      const agent = cmd.assignee ? await requireAgent(client.company, cmd.assignee) : null;
      const channel = CHANNELS.find((c) => c.key === cmd.channel)!.label.toLowerCase();
      let id = "";
      await db.transaction(async (tx) => {
        id = await nextTicketId(tx as unknown as Db);
        await tx.insert(t.tickets).values({
          id,
          client: client.id,
          company: client.company,
          cat: cmd.cat.trim().slice(0, 40) || "Other",
          subject,
          status: "Open",
          createdAt: at,
          priority: cmd.priority,
          channel: cmd.channel,
          assignee: agent?.id ?? null,
        });
        // What the client said, as the desk took it down.
        await tx.insert(t.ticketMessages).values([
          { ticket: id, from: "client", text: message, at, author: session.name },
          { ticket: id, from: "sys", text: `Ticket ${id} opened by ${session.name} from a ${channel}.`, at },
        ]);
      });
      await ticketEvent(db, id, session, "created", { channel: cmd.channel, priority: cmd.priority });
      if (agent) await ticketEvent(db, id, session, "assign", { to: agent.name });
      await sendSms({
        to: client.phone,
        company: client.company,
        purpose: "care-ticket",
        body: `${companyById(client.company).name}: we've logged your request as ${id} ("${subject}"). Reply in the app or call ${companyById(client.company).care}.`,
      });
      return { ok: true, id, message: `${id} opened for ${client.name}.` };
    }

    case "invoice.send": {
      need(session, "reminders.manage");
      const [charge] = await db.select().from(t.txns).where(eq(t.txns.id, cmd.invoice));
      if (!charge || charge.kind !== "charge") return { ok: false, error: "No such invoice." };
      const client = await getClient(db, charge.client);
      if (!client) return { ok: false, error: "No such client." };
      await requireCompany(session, client.company);
      const txns = (await db.select().from(t.txns).where(eq(t.txns.client, client.id))).map((x) => ({
        ...x,
        kind: x.kind as "charge" | "payment",
        channel: x.channel ?? undefined,
        payer: x.payer ?? undefined,
      }));
      const inv = invoicesFor(txns, [client], today()).find((i) => i.id === charge.id)!;
      if (inv.balance <= 0) return { ok: false, error: `${inv.id} is already paid.` };
      const co = companyById(client.company);
      await sendSms({
        to: client.phone,
        company: client.company,
        purpose: "invoice",
        body: `${co.name} invoice ${inv.id}: ${inv.description}, ${kes(inv.balance)} ${inv.status === "overdue" ? "overdue since" : "due"} ${fmtDate(inv.due)}. Pay via M-Pesa Paybill ${co.paybill}, account ${client.id}.`,
      });
      await audit(session, {
        action: "invoice.send",
        target: inv.id,
        company: client.company,
        detail: { client: client.id, balance: inv.balance, status: INVOICE_STATUS_LABEL[inv.status] },
      });
      return { ok: true, message: `Invoice sent to ${client.name} by SMS.` };
    }

    /* ---------------- clients ---------------- */

    case "client.add": {
      need(session, "clients.create");
      await requireCompany(session, cmd.company);
      const phone = cmd.phone.replace(/\s/g, "");
      if (!KE_MOBILE.test(phone)) return { ok: false, error: "Enter a Kenyan mobile number like 0712 345 678." };
      const name = cmd.name.trim().slice(0, 60);
      if (!name) return { ok: false, error: "Enter a name for the account." };
      const estate = ESTATES[cmd.estate];
      if (!estate || !companyById(cmd.company).estates.includes(cmd.estate)) {
        return { ok: false, error: "Pick one of your service estates." };
      }
      const plan = Math.max(100, Math.round(cmd.plan || 600));
      const type = cmd.clientType === "Business" ? "Business" : "Household";

      let id = "";
      await db.transaction(async (tx) => {
        const key = cmd.company + cmd.estate;
        const n = pad(await nextClientSeq(tx as unknown as Db, key), 4);
        id = `${cmd.company}-${cmd.estate}-${n}${luhn(n)}`;

        const spread = estate.radius * 0.62;
        const gate = offsetPoint(estate, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread);
        await tx.insert(t.clients).values({
          id,
          company: cmd.company,
          estate: cmd.estate,
          name,
          type,
          plan,
          phone: normalisePhone(phone),
          joined: at.slice(0, 10),
          lat: gate.lat,
          lng: gate.lng,
        });
        const month = at.slice(0, 7);
        await tx.insert(t.txns).values({
          id: `INV-${id}-${month}`,
          client: id,
          date: at,
          kind: "charge",
          amount: plan,
          desc: `Collection fee · ${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`,
        });
      });

      const co = companyById(cmd.company);
      await sendSms({
        to: normalisePhone(phone),
        company: cmd.company,
        purpose: "welcome",
        body: `Karibu ${name.split(" ")[0]}! Your ${co.name} account number is ${id}. Pay via M-Pesa Paybill ${co.paybill}, account ${id}. ${kes(plan)}/month.`,
      });
      await audit(session, { action: "client.create", target: id, company: cmd.company, detail: { name, plan } });
      return { ok: true, id, message: name };
    }

    /* ---------------- payments ---------------- */

    case "stk.start": {
      const client = await getClient(db, cmd.client);
      if (!client) return { ok: false, error: "No such account." };
      if (session.ws === "client") {
        need(session, "account.pay");
        if (session.scope.clientId !== client.id) deny("You can only pay for your own account.");
      } else {
        need(session, "payments.view");
        await requireCompany(session, client.company);
      }
      if (!KE_MOBILE.test(cmd.phone.replace(/\s/g, ""))) {
        return { ok: false, error: "Enter a Safaricom number like 0712 345 678." };
      }
      if (!(cmd.amount >= 1 && cmd.amount <= 150000)) {
        return { ok: false, error: "Amount must be between KES 1 and 150,000." };
      }
      let purpose = "account";
      if (cmd.purpose.startsWith("pickup:")) {
        const [req] = await db
          .select()
          .from(t.pickupRequests)
          .where(eq(t.pickupRequests.id, cmd.purpose.slice(7)));
        if (!req || req.client !== client.id) return { ok: false, error: "No such pickup request." };
        purpose = cmd.purpose;
      }
      const res = await startStk({
        company: client.company,
        client: client.id,
        phone: cmd.phone,
        amount: cmd.amount,
        purpose,
      });
      return res.ok ? { ok: true, id: res.id, mode: res.mode, message: res.message } : res;
    }

    case "stk.simulate": {
      const [req] = await db.select().from(t.stkRequests).where(eq(t.stkRequests.id, cmd.request));
      if (!req) return { ok: false, error: "No such payment request." };
      if (req.mode !== "simulated" || !demoMode()) deny("Live payments are confirmed by Safaricom, not the simulator.");
      if (session.ws === "client" ? session.scope.clientId !== req.client : !(await canSeeCompany(session, req.company))) {
        deny();
      }
      await settleStk(req.id, cmd.approve
        ? { success: true, resultCode: 0, resultDesc: "The service request is processed successfully." }
        : { success: false, resultCode: 1032, resultDesc: "Request cancelled by user." });
      return { ok: true };
    }

    case "c2b.simulate": {
      need(session, "payments.simulate");
      await requireCompany(session, cmd.company);
      if (!(cmd.amount >= 1 && cmd.amount <= 150000)) return { ok: false, error: "Amount must be between KES 1 and 150,000." };
      const res = await simulatePaybill(cmd.company, { account: cmd.account, amount: cmd.amount, phone: cmd.phone });
      if (!res.ok && !res.receipt) return { ok: false, error: res.message };
      return {
        ok: true,
        id: res.receipt,
        mode: res.mode,
        message: res.message,
        data: { matched: res.ok, date: at },
      };
    }

    case "suspense.assign": {
      need(session, "payments.reconcile");
      const [item] = await db.select().from(t.suspense).where(eq(t.suspense.id, cmd.id));
      if (!item) return { ok: false, error: "Already assigned." };
      await requireCompany(session, item.company);
      const client = await getClient(db, cmd.client);
      if (!client || client.company !== item.company) return { ok: false, error: "Pick one of your clients." };
      await db.transaction(async (tx) => {
        await tx
          .insert(t.txns)
          .values({
            id: item.id,
            client: client.id,
            date: item.date,
            kind: "payment",
            amount: item.amount,
            channel: "Paybill",
            payer: item.payer,
            desc: "M-Pesa Paybill (manually matched)",
          })
          .onConflictDoNothing();
        await tx.delete(t.suspense).where(eq(t.suspense.id, item.id));
      });
      await audit(session, {
        action: "payment.reconcile",
        target: item.id,
        company: item.company,
        detail: { client: client.id, amount: item.amount, typed: item.account },
      });
      return { ok: true, message: `${kes(item.amount)} assigned to ${client.id}` };
    }

    /* ---------------- on-demand pickups ---------------- */

    case "pickup.request": {
      need(session, "pickups.request");
      if (session.scope.clientId !== cmd.client) deny("You can only book pickups for your own account.");
      const client = await getClient(db, cmd.client);
      if (!client) return { ok: false, error: "No such account." };
      const kind = PICKUP_KINDS.find((k) => k.key === cmd.kind);
      if (!kind) return { ok: false, error: "Pick what needs collecting." };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.preferredDate) || cmd.preferredDate < today()) {
        return { ok: false, error: "Pick a date from today onwards." };
      }
      const price = (await priceList(client.company))[kind.key];
      const id = await nextPrefixedId(db, t.pickupRequests, "P-", 3000);
      await db.transaction(async (tx) => {
        await tx.insert(t.pickupRequests).values({
          id,
          client: client.id,
          company: client.company,
          kind: kind.key,
          notes: cmd.notes.trim().slice(0, 500),
          preferredDate: cmd.preferredDate,
          price,
          status: "Requested",
          photo: cmd.photo ?? null,
          createdAt: at,
        });
        await tx.insert(t.txns).values({
          id: `CHG-${id}`,
          client: client.id,
          date: at,
          kind: "charge",
          amount: price,
          desc: `On-demand pickup · ${kind.label} (${id})`,
        });
      });
      return { ok: true, id, message: `${kind.label} booked for ${kes(price)}.` };
    }

    case "pickup.update": {
      const [req] = await db.select().from(t.pickupRequests).where(eq(t.pickupRequests.id, cmd.id));
      if (!req) return { ok: false, error: "No such request." };
      const isOwner = session.scope.clientId === req.client;
      if (isOwner && session.ws === "client") {
        // Clients may only cancel their own request before it is scheduled.
        if (cmd.status !== "Cancelled" || req.status !== "Requested") deny();
      } else if (session.ws === "collector") {
        // The crew assigned to it may only mark it done.
        need(session, "route.complete");
        if (!req.truck || session.scope.truckId !== req.truck || cmd.status !== "Completed") deny();
        if (cmd.truck !== undefined || cmd.scheduledFor !== undefined) deny();
      } else {
        need(session, "pickups.manage");
        await requireCompany(session, req.company);
      }
      const set: Partial<typeof t.pickupRequests.$inferInsert> = {};
      if (cmd.status) set.status = cmd.status;
      if (cmd.truck !== undefined) set.truck = cmd.truck;
      if (cmd.scheduledFor !== undefined) set.scheduledFor = cmd.scheduledFor;
      await db.update(t.pickupRequests).set(set).where(eq(t.pickupRequests.id, req.id));

      const client = await getClient(db, req.client);
      if (cmd.status === "Cancelled" && !req.paid) {
        // Nothing was paid, so the charge raised at booking is reversed.
        await db.delete(t.txns).where(eq(t.txns.id, `CHG-${req.id}`));
      }
      if (client && cmd.status === "Scheduled") {
        await sendSms({
          to: client.phone,
          company: req.company,
          purpose: "pickup",
          body: `${companyById(req.company).name}: your ${PICKUP_KINDS.find((k) => k.key === req.kind)?.label.toLowerCase()} pickup ${req.id} is scheduled for ${cmd.scheduledFor ?? req.preferredDate}.`,
        });
      }
      if (cmd.status === "Completed") {
        await db.insert(t.pickups).values({
          client: req.client,
          when: at,
          truck: req.truck ?? "—",
          status: "On-demand",
        });
      }
      return { ok: true };
    }

    /* ---------------- dumping reports ---------------- */

    case "dump.report": {
      need(session, "dumping.report");
      const reporter = session.scope.clientId ?? session.sub;
      if (!(Math.abs(cmd.lat) <= 90 && Math.abs(cmd.lng) <= 180)) return { ok: false, error: "Pin the location on the map." };
      const description = cmd.description.trim().slice(0, 500);
      if (description.length < 5) return { ok: false, error: "Describe what was dumped." };
      // Route the report to the company serving the nearest estate.
      const nearest = Object.values(ESTATES)
        .map((e) => ({ e, d: distanceMeters(e, { lat: cmd.lat, lng: cmd.lng }) }))
        .sort((a, b) => a.d - b.d)[0];
      const estate = nearest && nearest.d < nearest.e.radius * 2 ? nearest.e.code : null;
      // Outside every estate, the reporter's own company picks it up rather than no one.
      const reporterCompany = session.scope.clientId ? ((await getClient(db, session.scope.clientId))?.company ?? null) : null;
      const company = estate ? (companyForEstate(estate)?.id ?? reporterCompany) : reporterCompany;
      const id = await nextPrefixedId(db, t.dumpReports, "D-", 2001);
      await db.insert(t.dumpReports).values({
        id,
        reporter,
        company,
        estate,
        lat: cmd.lat,
        lng: cmd.lng,
        description,
        size: ["small", "medium", "large"].includes(cmd.size) ? cmd.size : "small",
        photo: cmd.photo ?? null,
        status: "New",
        createdAt: at,
      });
      return { ok: true, id, message: company ? `Sent to ${companyById(company).name}.` : "Sent to the county desk." };
    }

    case "dump.update": {
      need(session, "dumping.manage");
      const [rep] = await db.select().from(t.dumpReports).where(eq(t.dumpReports.id, cmd.id));
      if (!rep) return { ok: false, error: "No such report." };
      if (rep.company) await requireCompany(session, rep.company);
      else if (session.scope.companyId) deny("Only the platform admin can route unassigned reports.");
      const set: Partial<typeof t.dumpReports.$inferInsert> = { status: cmd.status };
      if (cmd.status === "Cleared") set.clearedAt = at;
      if (cmd.company !== undefined && !session.scope.companyId) set.company = cmd.company;
      await db.update(t.dumpReports).set(set).where(eq(t.dumpReports.id, rep.id));
      await audit(session, { action: "dump.update", target: rep.id, company: rep.company, detail: { status: cmd.status } });
      return { ok: true };
    }

    /* ---------------- fleet management ---------------- */

    case "fleet.check": {
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      await requireTruckRecords(session, truck);
      const items = cleanCheckItems(cmd.items);
      if (!items) return { ok: false, error: "Answer every item on the check." };
      const odometer = int(cmd.odometerKm);
      if (!(odometer > 0 && odometer < 5_000_000)) return { ok: false, error: "Enter the odometer reading." };
      const last = await lastConfirmedOdometer(db, truck.id);
      if (odometer < last - 1) return { ok: false, error: `The odometer can't go backwards: the last reading was ${last} km.` };

      const defects = defectsOf(items);
      const critical = hasCriticalDefect(items);
      const notes = cmd.notes.trim().slice(0, 500);
      let woId = "";
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.inspections)
          .values({
            company: truck.company,
            truck: truck.id,
            driver: truck.driver,
            at,
            odometerKm: odometer,
            items,
            notes,
            photo: cmd.photo ?? null,
            result: defects.length ? "defects" : "pass",
          })
          .returning({ id: t.inspections.id });
        await tx.update(t.vehicles).set({ odometerKm: odometer }).where(eq(t.vehicles.truck, truck.id));
        if (defects.length) {
          // Defects go straight onto the workshop's list.
          woId = await nextFleetId(tx as unknown as Db, t.workOrders, "WO-", 1000);
          await tx.insert(t.workOrders).values({
            id: woId,
            company: truck.company,
            truck: truck.id,
            kind: "defect",
            title: `Defect: ${defects.map((d) => d.label).join(", ")}`,
            detail: notes,
            status: "open",
            openedAt: at,
            openedBy: truck.driver,
            inspection: row.id,
            critical,
            odometerKm: odometer,
          });
        }
      });
      if (defects.length) await refreshVehicleState(db, truck.id);
      return {
        ok: true,
        id: woId || undefined,
        message: critical
          ? "Critical defect reported. Don't drive this truck until the workshop clears it."
          : defects.length
            ? `Check saved. ${defects.length} defect${defects.length === 1 ? "" : "s"} sent to the workshop as ${woId}.`
            : "Check saved. Safe to drive.",
      };
    }

    case "fleet.fuel": {
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      await requireTruckRecords(session, truck);
      const litres = Math.round(Number(cmd.litres) * 10) / 10;
      const amount = int(cmd.amount);
      const odometer = int(cmd.odometerKm);
      if (!(litres > 0 && litres <= 1000)) return { ok: false, error: "Enter the litres, up to 1,000." };
      if (!(amount > 0 && amount <= 500_000)) return { ok: false, error: "Enter the amount paid." };
      if (!isPaymentAccount(cmd.paidFrom)) return { ok: false, error: "Pick how it was paid." };
      if (!(odometer > 0 && odometer < 5_000_000)) return { ok: false, error: "Enter the odometer reading." };
      const last = await lastConfirmedOdometer(db, truck.id);
      if (odometer < last - 1) return { ok: false, error: `The odometer can't go backwards: the last reading was ${last} km.` };
      const id = await nextFleetId(db, t.fuelLogs, "F-", 1000);
      await db.insert(t.fuelLogs).values({
        id,
        company: truck.company,
        truck: truck.id,
        at,
        litres,
        amount,
        odometerKm: odometer,
        station: cmd.station.trim().slice(0, 60),
        paidFrom: cmd.paidFrom,
        reference: cmd.reference?.trim().slice(0, 40) || null,
        driver: truck.driver,
        photo: cmd.photo ?? null,
      });
      await db.update(t.vehicles).set({ odometerKm: odometer }).where(eq(t.vehicles.truck, truck.id));
      return { ok: true, id, message: `${litres} L logged for ${kes(amount)}.` };
    }

    case "fleet.incident": {
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      await requireTruckRecords(session, truck);
      if (!INCIDENT_KINDS.some((k) => k.key === cmd.kind)) return { ok: false, error: "Pick what happened." };
      const description = cmd.description.trim().slice(0, 1000);
      if (description.length < 5) return { ok: false, error: "Describe what happened." };
      const located =
        typeof cmd.lat === "number" && typeof cmd.lng === "number" && Math.abs(cmd.lat) <= 90 && Math.abs(cmd.lng) <= 180;
      const id = await nextFleetId(db, t.incidents, "INC-", 1000);
      await db.insert(t.incidents).values({
        id,
        company: truck.company,
        truck: truck.id,
        driver: truck.driver,
        at,
        kind: cmd.kind,
        severity: cmd.severity === "major" ? "major" : "minor",
        description,
        lat: located ? cmd.lat! : null,
        lng: located ? cmd.lng! : null,
        photo: cmd.photo ?? null,
        policeRef: cmd.policeRef?.trim().slice(0, 40) || null,
        status: "open",
      });
      await audit(session, { action: "fleet.incident", target: id, company: truck.company, detail: { truck: truck.id, kind: cmd.kind } });
      return { ok: true, id, message: `Reported as ${id}. The office can see it now.` };
    }

    case "fleet.incidentClose": {
      need(session, "fleet.manage");
      const [inc] = await db.select().from(t.incidents).where(eq(t.incidents.id, cmd.id));
      if (!inc) return { ok: false, error: "No such incident." };
      await requireCompany(session, inc.company);
      const cost = int(cmd.cost);
      if (!(cost >= 0 && cost <= 10_000_000)) return { ok: false, error: "Enter the cost, or 0." };
      await db.update(t.incidents).set({ status: "closed", cost }).where(eq(t.incidents.id, inc.id));
      await audit(session, { action: "fleet.incident.close", target: inc.id, company: inc.company, detail: { cost } });
      return { ok: true, message: `${inc.id} closed.` };
    }

    case "fleet.workOrder": {
      need(session, "fleet.manage");
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      await requireCompany(session, truck.company);
      if (!(cmd.kind in WORK_ORDER_KIND_LABEL) || !(cmd.status in WORK_ORDER_STATUS_LABEL)) {
        return { ok: false, error: "Pick the kind and status." };
      }
      const title = cmd.title.trim().slice(0, 120);
      if (!title) return { ok: false, error: "Say what the job is." };
      const partsCost = int(cmd.partsCost);
      const labourCost = int(cmd.labourCost);
      if (!(partsCost >= 0 && labourCost >= 0 && partsCost + labourCost <= 5_000_000)) {
        return { ok: false, error: "Costs must be whole shillings, 0 or more." };
      }
      if (!isPaymentAccount(cmd.paidFrom)) return { ok: false, error: "Pick how the bill is paid." };
      const odometer = cmd.odometerKm === undefined || cmd.odometerKm === null ? null : int(cmd.odometerKm);
      if (odometer !== null && !(odometer > 0)) return { ok: false, error: "Enter a valid odometer reading." };

      const [existing] = cmd.id ? await db.select().from(t.workOrders).where(eq(t.workOrders.id, cmd.id)) : [];
      if (cmd.id && (!existing || existing.truck !== truck.id)) return { ok: false, error: "No such work order." };
      if (existing && (existing.status === "done" || existing.status === "cancelled")) {
        return { ok: false, error: `${existing.id} is closed; open a new work order instead.` };
      }
      const closing = cmd.status === "done" || cmd.status === "cancelled";
      const fields = {
        kind: cmd.kind,
        title,
        detail: cmd.detail.trim().slice(0, 1000),
        status: cmd.status,
        vendor: cmd.vendor.trim().slice(0, 80),
        partsCost,
        labourCost,
        paidFrom: cmd.paidFrom,
        odometerKm: odometer,
        closedAt: closing ? at : null,
      };
      const id = existing?.id ?? (await nextFleetId(db, t.workOrders, "WO-", 1000));
      if (existing) await db.update(t.workOrders).set(fields).where(eq(t.workOrders.id, id));
      else {
        await db
          .insert(t.workOrders)
          .values({ id, company: truck.company, truck: truck.id, openedAt: at, openedBy: session.name, ...fields });
      }

      // A finished service restarts the schedule from the reading it was done at.
      if (cmd.status === "done" && cmd.kind === "service") {
        const [v] = await db.select().from(t.vehicles).where(eq(t.vehicles.truck, truck.id));
        if (v) {
          await db
            .update(t.vehicles)
            .set({
              lastServiceKm: odometer ?? v.odometerKm,
              lastServiceDate: at.slice(0, 10),
              ...(odometer ? { odometerKm: Math.max(odometer, v.odometerKm) } : {}),
            })
            .where(eq(t.vehicles.truck, truck.id));
        }
      }
      const state = await refreshVehicleState(db, truck.id);
      await audit(session, {
        action: existing ? "fleet.workorder.update" : "fleet.workorder.open",
        target: id,
        company: truck.company,
        detail: { truck: truck.id, status: cmd.status, cost: partsCost + labourCost },
      });
      const where = state === "active" ? "in service" : state === "workshop" ? "in the workshop" : "off the road";
      return { ok: true, id, message: `${id}: ${WORK_ORDER_STATUS_LABEL[cmd.status].toLowerCase()}. ${truck.id} is ${where}.` };
    }

    case "fleet.document": {
      need(session, "fleet.manage");
      const kind = DOC_KINDS.find((k) => k.key === cmd.kind && k.subject === cmd.subjectType);
      if (!kind) return { ok: false, error: "Pick the document type." };
      if (!YMD.test(cmd.expiresOn)) return { ok: false, error: "Enter the expiry date." };
      const cost = int(cmd.cost);
      if (!(cost >= 0 && cost <= 5_000_000)) return { ok: false, error: "Enter what it cost, or 0." };
      if (cost > 0 && !isPaymentAccount(cmd.paidFrom)) return { ok: false, error: "Pick how it was paid." };
      let company: string;
      let subjectName: string;
      if (cmd.subjectType === "vehicle") {
        const truck = await getTruck(db, cmd.subject);
        if (!truck) return { ok: false, error: "No such truck." };
        company = truck.company;
        subjectName = truck.id;
      } else {
        const [u] = await db.select().from(t.users).where(eq(t.users.id, cmd.subject));
        if (!u?.scope.companyId) return { ok: false, error: "No such driver." };
        company = u.scope.companyId;
        subjectName = u.name;
      }
      await requireCompany(session, company);
      await db.insert(t.fleetDocuments).values({
        company,
        subjectType: cmd.subjectType,
        subject: cmd.subject,
        subjectName,
        kind: kind.key,
        number: cmd.number.trim().slice(0, 40),
        expiresOn: cmd.expiresOn,
        cost,
        paidFrom: isPaymentAccount(cmd.paidFrom) ? cmd.paidFrom : "1010",
        recordedAt: at,
        recordedBy: session.name,
      });
      await audit(session, {
        action: "fleet.document",
        target: subjectName,
        company,
        detail: { kind: kind.key, expiresOn: cmd.expiresOn, cost },
      });
      return { ok: true, message: `${kind.label} for ${subjectName} saved, valid to ${cmd.expiresOn}.` };
    }

    case "fleet.vehicle": {
      need(session, "fleet.manage");
      const [v] = await db.select().from(t.vehicles).where(eq(t.vehicles.truck, cmd.truck));
      if (!v) return { ok: false, error: "No such vehicle." };
      await requireCompany(session, v.company);
      const p = cmd.patch ?? {};
      const set: Partial<typeof t.vehicles.$inferInsert> = {};
      if (p.make !== undefined) set.make = String(p.make).trim().slice(0, 40);
      if (p.model !== undefined) set.model = String(p.model).trim().slice(0, 60);
      if (set.make === "" || set.model === "") return { ok: false, error: "Make and model can't be blank." };
      const ranges = [
        ["year", "Year", 1980, 2030],
        ["capacityKg", "Payload", 500, 40_000],
        ["tankL", "Tank size", 20, 1000],
        ["serviceEveryKm", "Service distance", 1000, 100_000],
        ["serviceEveryDays", "Service interval", 14, 730],
      ] as const;
      for (const [key, label, min, max] of ranges) {
        if (p[key] === undefined) continue;
        const n = int(p[key]);
        if (!(n >= min && n <= max)) return { ok: false, error: `${label} must be between ${min} and ${max}.` };
        set[key] = n;
      }
      if (p.expectedKmPerL !== undefined) {
        const n = Number(p.expectedKmPerL);
        if (!(n >= 1 && n <= 30)) return { ok: false, error: "Expected km per litre must be 1–30." };
        set.expectedKmPerL = Math.round(n * 10) / 10;
      }
      if (p.state !== undefined) {
        if (!["active", "workshop", "off_road"].includes(p.state)) return { ok: false, error: "Unknown state." };
        set.state = p.state;
      }
      if (!Object.keys(set).length) return { ok: true };
      await db.update(t.vehicles).set(set).where(eq(t.vehicles.truck, v.truck));
      await audit(session, { action: "fleet.vehicle", target: v.truck, company: v.company, detail: { fields: Object.keys(set) } });
      return { ok: true, message: `${v.truck} updated.` };
    }

    case "fleet.assign": {
      need(session, "fleet.manage");
      const truck = await getTruck(db, cmd.truck);
      if (!truck) return { ok: false, error: "No such truck." };
      await requireCompany(session, truck.company);
      const drivers = await companyDrivers(truck.company);
      const next = drivers.find((d) => d.id === cmd.user);
      if (!next) return { ok: false, error: "Pick one of your collectors." };
      if (next.truck === truck.id) return { ok: true, message: `${next.name} already drives ${truck.id}.` };
      const current = drivers.find((d) => d.truck === truck.id);
      // A straight swap: whoever drove this truck takes the new driver's old one.
      await db.transaction(async (tx) => {
        const [nu] = await tx.select().from(t.users).where(eq(t.users.id, next.id));
        await tx.update(t.users).set({ scope: { ...nu.scope, truckId: truck.id } }).where(eq(t.users.id, next.id));
        await tx.update(t.trucks).set({ driver: next.name }).where(eq(t.trucks.id, truck.id));
        if (current) {
          const [cu] = await tx.select().from(t.users).where(eq(t.users.id, current.id));
          const rest = { ...cu.scope };
          delete rest.truckId;
          await tx
            .update(t.users)
            .set({ scope: next.truck ? { ...rest, truckId: next.truck } : rest })
            .where(eq(t.users.id, current.id));
        }
        if (next.truck) {
          await tx.update(t.trucks).set({ driver: current?.name ?? "Unassigned" }).where(eq(t.trucks.id, next.truck));
        }
      });
      await audit(session, {
        action: "fleet.assign",
        target: truck.id,
        company: truck.company,
        detail: { driver: next.name, previous: current?.name ?? null },
      });
      return {
        ok: true,
        message: current
          ? `${next.name} now drives ${truck.id}; ${current.name} ${next.truck ? `moves to ${next.truck}` : "has no truck for now"}.`
          : `${next.name} now drives ${truck.id}.`,
      };
    }

    case "fleet.settings": {
      need(session, "fleet.manage");
      await requireCompany(session, cmd.company);
      try {
        const saved = await saveFleetSettings(cmd.company, cmd.settings, session.name);
        await audit(session, { action: "fleet.settings", company: cmd.company, detail: { ...saved } });
      } catch (err) {
        if (err instanceof HttpError) return { ok: false, error: err.message };
        throw err;
      }
      return { ok: true, message: "Fleet rules saved." };
    }


    case "user.lang": {
      await db
        .update(t.users)
        .set({ lang: cmd.lang === "sw" ? "sw" : "en" })
        .where(eq(t.users.id, session.sub));
      return { ok: true };
    }
  }
}

