// Server-only. The USSD menu: *384*…# for clients without a smartphone.
import { eq, sql } from "drizzle-orm";
import { normalisePhone, parseClientNumber } from "@/lib/clientNumber";
import { DAYS, MONTHS, group } from "@/lib/format";
import { PICKUP_KINDS } from "@/lib/integrations";
import { companyById } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { getDb, schema } from "./db";
import { startStk } from "./payments";
import { priceList } from "./settings";
import { nowStamp, today } from "./time";

const t = schema;

type Lang = "en" | "sw";

const S = {
  en: {
    welcome: (co: string) => `Welcome to ${co}`,
    menu: "1. My balance\n2. Pay now\n3. Next collection\n4. Report missed pickup\n5. Book extra pickup\n6. Kiswahili",
    unknown: "This number isn't registered.\nEnter your client number (e.g. TS-KIL-01427):",
    badNumber: "That client number isn't valid. Check it and dial again.",
    balanceDue: (id: string, amt: string) => `Account ${id}\nBalance due: KES ${amt}`,
    credit: (id: string, amt: string) => `Account ${id}\nIn credit: KES ${amt}`,
    paidUp: (id: string) => `Account ${id}\nYou are paid up. Asante!`,
    payConfirm: (amt: string, co: string) => `Pay KES ${amt} to ${co}?\n1. Yes\n2. Another amount`,
    enterAmount: "Enter amount (KES):",
    badAmount: "Enter an amount between 10 and 150,000.",
    promptSent: "Check your phone for the M-Pesa prompt and enter your PIN.",
    payFailed: (why: string) => `Payment could not start: ${why}`,
    next: (day: string) => `Next collection: ${day}`,
    reported: (id: string) => `Reported as ${id}. Our care desk will call you.`,
    kinds: "What needs collecting?",
    booked: (id: string, amt: string) => `Booked ${id} for KES ${amt}. We'll SMS the date. To pay, dial again and choose 2.`,
    invalid: "Invalid choice. Dial again.",
    switched: "Language set to Kiswahili. Dial again.",
  },
  sw: {
    welcome: (co: string) => `Karibu ${co}`,
    menu: "1. Salio langu\n2. Lipa sasa\n3. Siku ya kuzoa taka\n4. Ripoti taka hazikuzolewa\n5. Omba kuzolewa zaidi\n6. English",
    unknown: "Nambari hii haijasajiliwa.\nWeka nambari yako ya mteja (mf. TS-KIL-01427):",
    badNumber: "Nambari ya mteja si sahihi. Angalia na upige tena.",
    balanceDue: (id: string, amt: string) => `Akaunti ${id}\nDeni: KES ${amt}`,
    credit: (id: string, amt: string) => `Akaunti ${id}\nUna salio la ziada: KES ${amt}`,
    paidUp: (id: string) => `Akaunti ${id}\nHuna deni. Asante!`,
    payConfirm: (amt: string, co: string) => `Lipa KES ${amt} kwa ${co}?\n1. Ndiyo\n2. Kiasi kingine`,
    enterAmount: "Weka kiasi (KES):",
    badAmount: "Weka kiasi kati ya 10 na 150,000.",
    promptSent: "Angalia simu yako kwa ombi la M-Pesa na uweke PIN yako.",
    payFailed: (why: string) => `Malipo hayakuanza: ${why}`,
    next: (day: string) => `Siku ijayo ya kuzoa taka: ${day}`,
    reported: (id: string) => `Imeripotiwa kama ${id}. Huduma kwa wateja watakupigia.`,
    kinds: "Nini kizolewe?",
    booked: (id: string, amt: string) => `Imeombwa ${id} kwa KES ${amt}. Tutakutumia SMS ya tarehe. Kulipa, piga tena uchague 2.`,
    invalid: "Chaguo si sahihi. Piga tena.",
    switched: "Lugha imewekwa Kiingereza. Piga tena.",
  },
};

const DAYS_SW = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];

function nextCollection(estate: string, lang: Lang): string {
  const days = ESTATES[estate]?.days ?? [];
  const base = new Date(`${today()}T00:00:00`);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (days.includes(d.getDay())) {
      if (lang === "sw") return `${i === 0 ? "Leo, " : i === 1 ? "Kesho, " : ""}${DAYS_SW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
      return `${i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : ""}${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    }
  }
  return "—";
}

async function findClientByPhone(phone: string) {
  const digits = normalisePhone(phone).replace(/\s/g, "");
  const db = await getDb();
  const [c] = await db
    .select()
    .from(t.clients)
    .where(sql`replace(${t.clients.phone}, ' ', '') = ${digits}`);
  return c ?? null;
}

async function balance(client: string) {
  const db = await getDb();
  const [{ b }] = await db
    .select({
      b: sql<number>`coalesce(sum(case when ${t.txns.kind} = 'charge' then ${t.txns.amount} else -${t.txns.amount} end), 0)::int`,
    })
    .from(t.txns)
    .where(eq(t.txns.client, client));
  return b;
}

/**
 * One USSD step. `text` is every answer so far joined by "*" — Africa's
 * Talking's convention — and the reply starts with CON (continue) or END.
 */
export async function ussdReply(input: { phone: string; text: string }): Promise<string> {
  const db = await getDb();
  let parts = input.text ? input.text.split("*") : [];

  let client = await findClientByPhone(input.phone);
  if (!client) {
    // Unregistered number: the first answer is a client number, read-only access.
    if (parts.length === 0) return `CON ${S.en.unknown}`;
    const parsed = parseClientNumber(parts[0]);
    if (!parsed.ok) return `END ${S.en.badNumber}`;
    const [c] = await db.select().from(t.clients).where(eq(t.clients.id, parsed.id));
    if (!c) return `END ${S.en.badNumber}`;
    client = c;
    parts = parts.slice(1);
  }

  const lang: Lang = client.lang === "sw" ? "sw" : "en";
  const s = S[lang];
  const co = companyById(client.company);

  if (parts.length === 0) return `CON ${s.welcome(co.name)}\n${s.menu}`;

  switch (parts[0]) {
    case "1": {
      const b = await balance(client.id);
      return `END ${b > 0 ? s.balanceDue(client.id, group(b)) : b < 0 ? s.credit(client.id, group(-b)) : s.paidUp(client.id)}`;
    }

    case "2": {
      const b = await balance(client.id);
      const due = Math.max(b, client.plan);
      if (parts.length === 1) return `CON ${s.payConfirm(group(due), co.name)}`;
      let amount = due;
      if (parts[1] === "2") {
        if (parts.length === 2) return `CON ${s.enterAmount}`;
        amount = Number(parts[2]);
        if (!(amount >= 10 && amount <= 150000)) return `END ${s.badAmount}`;
      } else if (parts[1] !== "1") {
        return `END ${s.invalid}`;
      }
      // The prompt goes to the phone that dialled, paying into this account.
      const res = await startStk({
        company: client.company,
        client: client.id,
        phone: input.phone,
        amount,
        purpose: "account",
      });
      return `END ${res.ok ? s.promptSent : s.payFailed(res.error)}`;
    }

    case "3":
      return `END ${s.next(nextCollection(client.estate, lang))}`;

    case "4": {
      const at = nowStamp();
      const [{ n }] = await db
        .select({ n: sql<number>`coalesce(max(substring(${t.tickets.id} from 3)::int), 1045)` })
        .from(t.tickets);
      const id = `T-${n + 1}`;
      await db.insert(t.tickets).values({
        id,
        client: client.id,
        company: client.company,
        cat: "Missed pickup",
        subject: "Missed pickup (reported by USSD)",
        status: "Open",
        createdAt: at,
      });
      await db.insert(t.ticketMessages).values({
        ticket: id,
        from: "client",
        text: `Missed pickup reported by USSD from ${normalisePhone(input.phone)}.`,
        at,
      });
      return `END ${s.reported(id)}`;
    }

    case "5": {
      const prices = await priceList(client.company);
      if (parts.length === 1) {
        const list = PICKUP_KINDS.map((k, i) => `${i + 1}. ${k.label} (KES ${group(prices[k.key])})`).join("\n");
        return `CON ${s.kinds}\n${list}`;
      }
      const kind = PICKUP_KINDS[Number(parts[1]) - 1];
      if (!kind) return `END ${s.invalid}`;
      const at = nowStamp();
      const [{ n }] = await db
        .select({ n: sql<number>`coalesce(max(substring(${t.pickupRequests.id} from 3)::int), 3000)` })
        .from(t.pickupRequests);
      const id = `P-${n + 1}`;
      const tomorrow = new Date(`${today()}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const preferred = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      await db.insert(t.pickupRequests).values({
        id,
        client: client.id,
        company: client.company,
        kind: kind.key,
        notes: "Booked by USSD",
        preferredDate: preferred,
        price: prices[kind.key],
        status: "Requested",
        createdAt: at,
      });
      await db.insert(t.txns).values({
        id: `CHG-${id}`,
        client: client.id,
        date: at,
        kind: "charge",
        amount: prices[kind.key],
        desc: `On-demand pickup · ${kind.label} (${id})`,
      });
      return `END ${s.booked(id, group(prices[kind.key]))}`;
    }

    case "6": {
      await db
        .update(t.clients)
        .set({ lang: lang === "sw" ? "en" : "sw" })
        .where(eq(t.clients.id, client.id));
      return `END ${s.switched}`;
    }

    default:
      return `END ${s.invalid}`;
  }
}
