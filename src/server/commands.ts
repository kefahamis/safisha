// Server-only. Applies one command for one session, after checking it's allowed.
import { and, eq, like, sql } from "drizzle-orm";
import type { Session } from "@/lib/auth/types";
import { luhn, normalisePhone, KE_MOBILE } from "@/lib/clientNumber";
import type { Command, CommandResult } from "@/lib/commands";
import { kes, MONTHS, pad } from "@/lib/format";
import { distanceMeters, offsetPoint, truckPos } from "@/lib/geo";
import { PICKUP_KINDS } from "@/lib/integrations";
import { companyById, companyForEstate } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { optimiseRoute, tourLength } from "@/lib/routeOpt";
import type { Truck } from "@/lib/types";
import { audit } from "./audit";
import { getDb, schema, type Db } from "./db";
import { sendSms } from "./integrations/messaging";
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

async function getClient(db: Db, id: string) {
  const [c] = await db.select().from(t.clients).where(eq(t.clients.id, id));
  return c ?? null;
}

async function getTruck(db: Db, id: string) {
  const [x] = await db.select().from(t.trucks).where(eq(t.trucks.id, id));
  return x ?? null;
}

async function nextTicketId(db: Db) {
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(max(substring(${t.tickets.id} from 3)::int), 1045)` })
    .from(t.tickets);
  return `T-${n + 1}`;
}

async function nextId(db: Db, table: typeof t.pickupRequests | typeof t.dumpReports, prefix: string, start: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(max(substring(${table.id} from ${prefix.length + 1})::int), ${start})` })
    .from(table);
  return `${prefix}${n + 1}`;
}

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

      await db.insert(t.ticketMessages).values({ ticket: ticket.id, from: cmd.from, text, at });
      const status =
        cmd.from === "agent" && ticket.status === "Open"
          ? "Pending"
          : cmd.from === "client" && ticket.status === "Resolved"
            ? "Open"
            : ticket.status;
      if (status !== ticket.status) await db.update(t.tickets).set({ status }).where(eq(t.tickets.id, ticket.id));

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
      await db.update(t.tickets).set({ status: cmd.status }).where(eq(t.tickets.id, ticket.id));
      await db.insert(t.ticketMessages).values({
        ticket: ticket.id,
        from: "sys",
        text: `Status changed to ${cmd.status}`,
        at,
      });
      return { ok: true };
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
        const [row] = await tx.select().from(t.clientSeq).where(eq(t.clientSeq.key, key));
        const next = (row?.value ?? 100 + Math.floor(Math.random() * 300)) + 1;
        await tx
          .insert(t.clientSeq)
          .values({ key, value: next })
          .onConflictDoUpdate({ target: t.clientSeq.key, set: { value: next } });
        const n = pad(next, 4);
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
      if (req.mode !== "simulated") deny("Live payments are confirmed by Safaricom, not the simulator.");
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
      const id = await nextId(db, t.pickupRequests, "P-", 3000);
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
      const company = estate ? (companyForEstate(estate)?.id ?? null) : null;
      const id = await nextId(db, t.dumpReports, "D-", 2001);
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

    case "user.lang": {
      await db
        .update(t.users)
        .set({ lang: cmd.lang === "sw" ? "sw" : "en" })
        .where(eq(t.users.id, session.sub));
      return { ok: true };
    }
  }
}

