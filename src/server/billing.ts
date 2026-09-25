// Server-only. Monthly charges and escalating arrears reminders.
import { and, eq, inArray } from "drizzle-orm";
import { group, kes, MONTHS } from "@/lib/format";
import { COMPANIES, companyById } from "@/lib/reference/companies";
import { getDb, schema } from "./db";
import { sendSms } from "./integrations/messaging";
import { startStk } from "./payments";
import { reminderPolicy } from "./settings";
import { nowStamp, thisMonth, today } from "./time";

const t = schema;

export type Stage = "sms" | "stk" | "warn";
const ORDER: Stage[] = ["sms", "stk", "warn"];

export interface ArrearsRow {
  client: string;
  name: string;
  phone: string;
  balance: number;
  daysOverdue: number;
  /** The stage this run would send, if any. */
  due: Stage | null;
  sent: Stage[];
}

const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** Raises this month's collection fee for every client that doesn't have one yet. */
export async function raiseMonthlyCharges(company?: string) {
  const db = await getDb();
  const month = thisMonth();
  const rows = await db
    .select()
    .from(t.clients)
    .where(company ? eq(t.clients.company, company) : undefined);
  let raised = 0;
  for (const c of rows) {
    const inserted = await db
      .insert(t.txns)
      .values({
        id: `INV-${c.id}-${month}`,
        client: c.id,
        date: `${month}-01 00:05`,
        kind: "charge",
        amount: c.plan,
        desc: `Collection fee · ${monthLabel(month)}`,
      })
      .onConflictDoNothing()
      .returning({ id: t.txns.id });
    // The seed used a shorter id for the months it created; don't double-bill those.
    if (inserted.length) {
      const legacy = `INV-${c.id}-${Number(month.slice(5))}`;
      const [dup] = await db.select().from(t.txns).where(eq(t.txns.id, legacy));
      if (dup && dup.date.startsWith(month)) {
        await db.delete(t.txns).where(eq(t.txns.id, inserted[0].id));
        continue;
      }
      raised++;
    }
  }
  return { month, raised };
}

/**
 * Days since the oldest charge that payments haven't covered. Payments settle
 * the oldest charges first, the way people expect a running account to work.
 */
function daysOverdue(txns: { kind: string; amount: number; date: string }[], asOf: string): number {
  const charges = txns.filter((x) => x.kind === "charge").sort((a, b) => a.date.localeCompare(b.date));
  let paid = txns.filter((x) => x.kind === "payment").reduce((a, x) => a + x.amount, 0);
  for (const c of charges) {
    if (paid >= c.amount) {
      paid -= c.amount;
      continue;
    }
    const from = new Date(`${c.date.slice(0, 10)}T00:00:00`);
    const to = new Date(`${asOf}T00:00:00`);
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  }
  return 0;
}

export async function arrears(company: string): Promise<{ rows: ArrearsRow[]; policy: Awaited<ReturnType<typeof reminderPolicy>> }> {
  const db = await getDb();
  const policy = await reminderPolicy(company);
  const month = thisMonth();
  const asOf = today();
  const clients = await db.select().from(t.clients).where(eq(t.clients.company, company));
  if (!clients.length) return { rows: [], policy };
  const ids = clients.map((c) => c.id);
  const [txns, log] = await Promise.all([
    db.select().from(t.txns).where(inArray(t.txns.client, ids)),
    db.select().from(t.reminderLog).where(and(inArray(t.reminderLog.client, ids), eq(t.reminderLog.month, month))),
  ]);

  const rows: ArrearsRow[] = [];
  for (const c of clients) {
    const mine = txns.filter((x) => x.client === c.id);
    const balance = mine.reduce((b, x) => b + (x.kind === "charge" ? x.amount : -x.amount), 0);
    if (balance <= 0) continue;
    const overdue = daysOverdue(mine, asOf);
    const sent = log.filter((l) => l.client === c.id).map((l) => l.stage as Stage);
    const threshold: Record<Stage, number> = {
      sms: policy.smsAfterDays,
      stk: policy.stkAfterDays,
      warn: policy.warnAfterDays,
    };
    // The furthest stage reached that hasn't gone out this month.
    let due: Stage | null = null;
    if (balance >= policy.minBalance) {
      for (const stage of [...ORDER].reverse()) {
        if (overdue >= threshold[stage] && !sent.includes(stage)) {
          due = stage;
          break;
        }
      }
    }
    rows.push({ client: c.id, name: c.name, phone: c.phone, balance, daysOverdue: overdue, due, sent });
  }
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
  return { rows, policy };
}

/** Sends every reminder that's due for one company. */
export async function runReminders(company: string) {
  const db = await getDb();
  const co = companyById(company);
  const month = thisMonth();
  const { rows } = await arrears(company);
  const sent: { client: string; stage: Stage; ok: boolean; detail: string }[] = [];

  for (const r of rows) {
    if (!r.due) continue;
    let ok = true;
    let detail = "";
    if (r.due === "sms") {
      const res = await sendSms({
        to: r.phone,
        company,
        purpose: "reminder",
        body: `${co.name}: your account ${r.client} has ${kes(r.balance)} due. Pay via M-Pesa Paybill ${co.paybill}, account ${r.client}. Asante!`,
      });
      ok = res.status !== "failed";
      detail = res.status;
    } else if (r.due === "stk") {
      const res = await startStk({ company, client: r.client, phone: r.phone, amount: r.balance, purpose: "account" });
      ok = res.ok;
      detail = res.ok ? `prompt ${res.mode}` : res.error;
      if (res.ok) {
        await sendSms({
          to: r.phone,
          company,
          purpose: "reminder",
          body: `${co.name}: we've sent an M-Pesa prompt for ${kes(r.balance)} to this phone. Enter your PIN to clear account ${r.client}.`,
        });
      }
    } else {
      const res = await sendSms({
        to: r.phone,
        company,
        purpose: "reminder",
        body: `${co.name}: account ${r.client} is ${r.daysOverdue} days overdue (${kes(r.balance)}). Collection may be paused if unpaid. Paybill ${co.paybill}, account ${r.client}.`,
      });
      ok = res.status !== "failed";
      detail = res.status;
    }
    if (ok) {
      await db
        .insert(t.reminderLog)
        .values({ client: r.client, month, stage: r.due, detail })
        .onConflictDoNothing();
    }
    sent.push({ client: r.client, stage: r.due, ok, detail });
  }
  return { month, sent, at: nowStamp() };
}

/** The scheduled job: this month's charges, then reminders where turned on. */
export async function runBillingCycle() {
  const charges = await raiseMonthlyCharges();
  const reminders: Record<string, number> = {};
  for (const co of COMPANIES) {
    const policy = await reminderPolicy(co.id);
    if (!policy.enabled) continue;
    const res = await runReminders(co.id);
    reminders[co.id] = res.sent.filter((s) => s.ok).length;
  }
  return { charges, reminders };
}

export const stageLabel: Record<Stage, string> = {
  sms: "SMS reminder",
  stk: "M-Pesa prompt",
  warn: "Service warning",
};

export const fmtBalance = (n: number) => `KES ${group(n)}`;
