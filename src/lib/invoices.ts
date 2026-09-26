/*
 * Invoices: every charge raised on a client's account — the monthly
 * collection fee and on-demand pickups — with the M-Pesa payments that settled
 * it. Payments are applied oldest invoice first, the way a statement reads, so
 * nothing is stored twice: the invoice view is worked out from txns.
 */

import type { Client, Txn } from "./types";

/** Days a client has to pay after an invoice is raised. */
export const INVOICE_TERMS_DAYS = 10;

export type InvoiceStatus = "paid" | "partly_paid" | "unpaid" | "overdue";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  partly_paid: "Part paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  channel?: string;
}

export interface Invoice {
  /** The charge's id doubles as the invoice number. */
  id: string;
  client: string;
  company: string;
  /** "YYYY-MM-DD HH:mm" */
  issued: string;
  /** "YYYY-MM-DD" */
  due: string;
  description: string;
  amount: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  /** The payments (or parts of them) that went to this invoice. */
  payments: InvoicePayment[];
}

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Invoices for these clients, newest first, as at `today` ("YYYY-MM-DD"). */
export function invoicesFor(txns: Txn[], clients: Pick<Client, "id" | "company">[], today: string): Invoice[] {
  const out: Invoice[] = [];
  for (const c of clients) {
    const mine = txns.filter((t) => t.client === c.id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const charges = mine.filter((t) => t.kind === "charge" && t.amount > 0);
    const invoices: Invoice[] = charges.map((t) => ({
      id: t.id,
      client: c.id,
      company: c.company,
      issued: t.date,
      due: addDays(t.date.slice(0, 10), INVOICE_TERMS_DAYS),
      description: t.desc,
      amount: t.amount,
      paid: 0,
      balance: t.amount,
      status: "unpaid",
      payments: [],
    }));

    // Oldest invoice first, whatever order the money came in.
    let i = 0;
    for (const p of mine.filter((t) => t.kind === "payment" && t.amount > 0)) {
      let left = p.amount;
      while (left > 0 && i < invoices.length) {
        const inv = invoices[i];
        const take = Math.min(left, inv.balance);
        if (take > 0) {
          inv.paid += take;
          inv.balance -= take;
          inv.payments.push({ id: p.id, date: p.date, amount: take, channel: p.channel });
          left -= take;
        }
        if (inv.balance === 0) i++;
      }
    }

    for (const inv of invoices) {
      inv.status =
        inv.balance === 0 ? "paid" : inv.due < today ? "overdue" : inv.paid > 0 ? "partly_paid" : "unpaid";
    }
    out.push(...invoices);
  }
  return out.sort((a, b) => b.issued.localeCompare(a.issued) || a.client.localeCompare(b.client));
}
