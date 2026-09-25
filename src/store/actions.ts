import { TODAY } from "@/lib/clock";
import {
  KE_MOBILE,
  nextClientNumber,
  normalisePhone,
  parseClientNumber,
  receiptNumber,
} from "@/lib/clientNumber";
import { kes, stamp } from "@/lib/format";
import { offsetPoint } from "@/lib/geo";
import { companyById } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { balance, clientById, nowIn } from "@/lib/selectors";
import type {
  ClientType,
  StatementPeriod,
  StopStatus,
  TicketAuthor,
  TicketStatus,
  Txn,
} from "@/lib/types";
import type { AppStore } from "./appStore";

export interface NewClientInput {
  name: string;
  phone: string;
  estate: string;
  type: ClientType;
  plan: number;
}

export interface C2BInput {
  account: string;
  amount: number;
  phone: string;
}

export type ActionResult<T extends object = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface C2BResult {
  ok: boolean;
  message: string;
  receipt: string;
  date: string;
}

export function createActions(store: AppStore) {
  const { update, getState } = store;
  const nextTicketId = () => `T-${1046 + getState().tickets.length}`;

  return {
    /* ---- context switching ---- */

    selectClient(id: string) {
      update((s) => {
        s.clientId = id;
        s.selTicket = null;
      });
    },

    selectCompany(id: string) {
      update((s) => {
        s.companyId = id;
        s.selTicket = null;
        s.estateFilter = "";
      });
    },

    selectTruck(id: string) {
      update((s) => {
        s.truckId = id;
      });
    },

    /** Opening a client from the admin database drops into that company's view. */
    focusClient(id: string) {
      update((s) => {
        const c = clientById(s, id);
        if (c) s.companyId = c.company;
        s.stmtClient = id;
      });
    },

    /* ---- view-local filters ---- */

    setQuery(q: string) {
      update((s) => {
        s.q = q;
      });
    },

    setEstateFilter(estate: string) {
      update((s) => {
        s.estateFilter = estate;
      });
    },

    setPeriod(period: StatementPeriod) {
      update((s) => {
        s.stmtPeriod = period;
      });
    },

    setStatementClient(id: string) {
      update((s) => {
        s.stmtClient = id;
      });
    },

    selectTicket(id: string | null) {
      update((s) => {
        s.selTicket = id;
      });
    },

    resetFilters() {
      update((s) => {
        s.q = "";
        s.estateFilter = "";
        s.selTicket = null;
      });
    },

    /* ---- live fleet ---- */

    /** One second of simulated driving. */
    tick() {
      update((s) => {
        s.elapsedMs += 1000;
        for (const t of s.trucks) {
          if (t.status !== "offline" && t.sharing) t.d += t.speed;
        }
      });
    },

    setSharing(truckId: string, sharing: boolean) {
      update((s) => {
        const t = s.trucks.find((x) => x.id === truckId);
        if (!t) return;
        t.sharing = sharing;
        if (sharing) t.status = "route";
      });
    },

    /* ---- route sheet ---- */

    markStop(truckId: string, clientId: string, status: StopStatus) {
      update((s) => {
        const sheet = (s.stops[truckId] ??= {});
        sheet[clientId] = status;

        if (status === "Collected") {
          s.pickups.push({
            client: clientId,
            when: stamp(nowIn(s)),
            truck: truckId,
            status: "Collected",
          });
          return;
        }

        // A skipped stop opens a care ticket so the client hears about it.
        const c = clientById(s, clientId);
        if (!c) return;
        const at = stamp(nowIn(s));
        s.tickets.push({
          id: nextTicketId(),
          client: clientId,
          company: c.company,
          cat: "Missed pickup",
          subject: "Crew could not access your gate",
          status: "Open",
          msgs: [
            {
              from: "agent",
              text: `Our crew on ${truckId} could not access your gate at ${at.slice(
                11,
              )}. Reply here to arrange a return visit.`,
              at,
            },
          ],
        });
      });
    },

    undoStop(truckId: string, clientId: string) {
      update((s) => {
        delete s.stops[truckId]?.[clientId];
        s.pickups = s.pickups.filter(
          (p) => !(p.client === clientId && p.truck === truckId && p.when.startsWith(TODAY)),
        );
      });
    },

    /* ---- customer care ---- */

    reply(ticketId: string, from: Exclude<TicketAuthor, "sys">, text: string) {
      const body = text.trim();
      if (!body) return;
      update((s) => {
        const t = s.tickets.find((x) => x.id === ticketId);
        if (!t) return;
        t.msgs.push({ from, text: body, at: stamp(nowIn(s)) });
        if (from === "agent" && t.status === "Open") t.status = "Pending";
        if (from === "client" && t.status === "Resolved") t.status = "Open";
      });
    },

    setTicketStatus(ticketId: string, status: TicketStatus) {
      update((s) => {
        const t = s.tickets.find((x) => x.id === ticketId);
        if (!t) return;
        t.status = status;
        t.msgs.push({ from: "sys", text: `Status changed to ${status}`, at: stamp(nowIn(s)) });
      });
    },

    createTicket(clientId: string, cat: string, subject: string, message: string): string {
      const id = nextTicketId();
      update((s) => {
        const c = clientById(s, clientId);
        if (!c) return;
        const at = stamp(nowIn(s));
        s.tickets.push({
          id,
          client: c.id,
          company: c.company,
          cat,
          subject: subject.trim(),
          status: "Open",
          msgs: [
            { from: "client", text: message.trim(), at },
            {
              from: "sys",
              text: `Ticket ${id} created. ${companyById(c.company).name} usually replies within 2 hours.`,
              at,
            },
          ],
        });
        s.selTicket = id;
      });
      return id;
    },

    /* ---- client registration ---- */

    addClient(companyId: string, input: NewClientInput): ActionResult<{ id: string; name: string }> {
      const phone = input.phone.replace(/\s/g, "");
      if (!KE_MOBILE.test(phone)) {
        return { ok: false, error: "Enter a Kenyan mobile number like 0712 345 678." };
      }
      const name = input.name.trim();
      if (!name) return { ok: false, error: "Enter a name for the account." };

      let id = "";
      update((s) => {
        const e = ESTATES[input.estate];
        id = nextClientNumber(s.seq, companyId, input.estate, Math.random);
        const spread = e.radius * 0.62;
        const gate = offsetPoint(
          e,
          (Math.random() - 0.5) * 2 * spread,
          (Math.random() - 0.5) * 2 * spread,
        );
        s.clients.push({
          id,
          company: companyId,
          estate: input.estate,
          name,
          type: input.type,
          plan: Math.max(100, input.plan || 600),
          phone: normalisePhone(phone),
          joined: stamp(nowIn(s)).slice(0, 10),
          lat: gate.lat,
          lng: gate.lng,
        });
        s.txns.push({
          id: `INV-${id}-9`,
          client: id,
          date: stamp(nowIn(s)),
          kind: "charge",
          amount: Math.max(100, input.plan || 600),
          desc: "Collection fee · Sep 2026",
        });
        s.q = "";
      });
      return { ok: true, id, name };
    },

    /* ---- M-Pesa ---- */

    openStk(clientId: string) {
      update((s) => {
        const c = clientById(s, clientId);
        if (!c) return;
        s.stk = {
          step: "form",
          client: c.id,
          phone: c.phone,
          amount: Math.max(balance(s, c.id), c.plan),
        };
      });
    },

    closeStk() {
      update((s) => {
        s.stk = null;
      });
    },

    /** Validates the STK form and moves on to the simulated handset prompt. */
    submitStk(phone: string, amount: number): ActionResult {
      if (!KE_MOBILE.test(phone.replace(/\s/g, ""))) {
        return { ok: false, error: "Enter a Safaricom number like 0712 345 678." };
      }
      if (!(amount >= 10 && amount <= 150000)) {
        return { ok: false, error: "Amount must be between KES 10 and 150,000." };
      }
      update((s) => {
        if (!s.stk) return;
        s.stk.phone = phone;
        s.stk.amount = Math.round(amount);
        s.stk.step = "phone";
      });
      return { ok: true };
    },

    setStkStep(step: "wait" | "declined") {
      update((s) => {
        if (s.stk) s.stk.step = step;
      });
    },

    /** Safaricom's callback arriving: post the payment and show the receipt. */
    completeStk() {
      update((s) => {
        if (!s.stk) return;
        const txn: Txn = {
          id: receiptNumber(),
          client: s.stk.client,
          date: stamp(nowIn(s)),
          kind: "payment",
          amount: s.stk.amount,
          channel: "STK Push",
          payer: s.stk.phone,
          desc: "M-Pesa STK Push",
        };
        s.txns.push(txn);
        s.stk.txn = txn;
        s.stk.step = "done";
      });
    },

    /** Stands in for Safaricom's C2B confirmation callback. */
    payC2B(companyId: string, input: C2BInput): C2BResult {
      const rec = receiptNumber();
      let result!: C2BResult;

      update((s) => {
        const date = stamp(nowIn(s));
        const parsed = parseClientNumber(input.account);
        const matched = parsed.ok ? clientById(s, parsed.id) : undefined;

        if (parsed.ok && matched && matched.company === companyId) {
          s.txns.push({
            id: rec,
            client: matched.id,
            date,
            kind: "payment",
            amount: input.amount,
            channel: "Paybill",
            payer: input.phone,
            desc: "M-Pesa Paybill",
          });
          result = {
            ok: true,
            receipt: rec,
            date,
            message: `Matched to ${matched.name}. New balance ${kes(balance(s, matched.id))}.`,
          };
          return;
        }

        const reason = !parsed.ok
          ? parsed.reason
          : !matched
            ? "No client with this number"
            : "Number belongs to another company";
        s.suspense.unshift({
          id: rec,
          account: input.account,
          amount: input.amount,
          payer: input.phone,
          date,
          company: companyId,
          reason,
        });
        result = { ok: false, receipt: rec, date, message: `Held in suspense: ${reason}.` };
      });

      return result;
    },

    assignSuspense(suspenseId: string, clientId: string): string {
      let label = "";
      update((s) => {
        const item = s.suspense.find((x) => x.id === suspenseId);
        if (!item) return;
        s.txns.push({
          id: item.id,
          client: clientId,
          date: item.date,
          kind: "payment",
          amount: item.amount,
          channel: "Paybill",
          payer: item.payer,
          desc: "M-Pesa Paybill (manually matched)",
        });
        s.suspense = s.suspense.filter((x) => x.id !== suspenseId);
        label = `${kes(item.amount)} assigned to ${clientId}`;
      });
      return label;
    },
  };
}

export type AppActions = ReturnType<typeof createActions>;
