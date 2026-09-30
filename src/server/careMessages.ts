// Server-only. Care messages outside the app: SMS and email out, and client replies coming back in.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { companyById } from "@/lib/reference/companies";
import { getDb, schema as t, type Db } from "./db";
import { nextPrefixedId } from "./ids";
import { careReplyTo, sendEmail, sendSms } from "./integrations/messaging";
import { hasFeature } from "./packages";
import { nowStamp } from "./time";

/** The email on the client's own sign-in account, if they have one. */
async function clientEmail(clientId: string): Promise<string | null> {
  const db = await getDb();
  const [u] = await db
    .select({ email: t.users.email })
    .from(t.users)
    .where(sql`${t.users.scope}->>'clientId' = ${clientId}`)
    .limit(1);
  return u?.email ?? null;
}

/** "[T-1046]" in a subject is how a reply by email finds its ticket. */
const subjectTag = (ticket: string) => `[${ticket}]`;

/**
 * Tells a client about their ticket by SMS and email, as far as the company's
 * package allows: SMS is held back inside sendSms, email here.
 */
export async function notifyClient(input: {
  client: { id: string; phone: string; company: string };
  ticket: string;
  subject: string;
  purpose: "care-reply" | "care-ticket";
  sms: string;
  email: string;
}) {
  const { client } = input;
  await sendSms({ to: client.phone, company: client.company, purpose: input.purpose, body: input.sms });
  if (!(await hasFeature(client.company, "email"))) return;
  const db = await getDb();
  const [prefs] = await db.select({ notify: t.clients.notify }).from(t.clients).where(eq(t.clients.id, client.id));
  if (prefs?.notify.careEmail === false) return;
  const to = await clientEmail(client.id);
  if (!to) return;
  const replyTo = await careReplyTo();
  const co = companyById(client.company);
  await sendEmail({
    to,
    replyTo,
    subject: `${co.name} care: ${input.subject} ${subjectTag(input.ticket)}`,
    text: `${input.email}\n\n${replyTo ? "Reply to this email to answer, or " : ""}open the app to see the whole conversation.${co.care ? ` Care line: ${co.care}.` : ""}\n\n${co.name}`,
  });
}

/* ---------------- replies coming in ---------------- */

export type InboundResult = { ok: true; ticket: string; created: boolean } | { ok: false; reason: string };

/**
 * A message from a client by SMS or email. It joins the ticket it answers
 * (named in an email subject, else their latest open one) or starts a new
 * one. Only companies whose package includes replies by SMS and email accept these.
 */
export async function receiveClientMessage(input: {
  client: { id: string; name: string; company: string };
  channel: "sms" | "email";
  text: string;
  subject?: string;
}): Promise<InboundResult> {
  if (!(await hasFeature(input.client.company, "twoWay"))) return { ok: false, reason: "not in the company's package" };
  const text = input.text.trim().slice(0, 2000);
  if (!text) return { ok: false, reason: "empty message" };

  const db = await getDb();
  const at = nowStamp();
  const named = input.subject?.match(/\[(T-\d+)\]/)?.[1];
  const mine = and(eq(t.tickets.client, input.client.id), eq(t.tickets.company, input.client.company));
  const [ticket] = named
    ? await db.select().from(t.tickets).where(and(mine, eq(t.tickets.id, named)))
    : await db
        .select()
        .from(t.tickets)
        .where(and(mine, inArray(t.tickets.status, ["Open", "Pending"])))
        .orderBy(desc(t.tickets.createdAt))
        .limit(1);

  if (ticket) {
    await db.insert(t.ticketMessages).values({ ticket: ticket.id, from: "client", text, at });
    // A reply reopens a resolved ticket and puts it back with the desk.
    if (ticket.status !== "Open") {
      await db.update(t.tickets).set({ status: "Open", resolvedAt: null }).where(eq(t.tickets.id, ticket.id));
    }
    return { ok: true, ticket: ticket.id, created: false };
  }

  const subject = (input.subject?.replace(/^(re|fwd?):\s*/i, "").trim() || text.split(/[.?!\n]/)[0]).slice(0, 80);
  let id = "";
  await db.transaction(async (tx) => {
    id = await nextPrefixedId(tx as unknown as Db, t.tickets, "T-", 1045);
    await tx.insert(t.tickets).values({
      id,
      client: input.client.id,
      company: input.client.company,
      cat: "Other",
      subject,
      status: "Open",
      createdAt: at,
      channel: input.channel,
    });
    await tx.insert(t.ticketMessages).values([
      { ticket: id, from: "client", text, at },
      { ticket: id, from: "sys", text: `Ticket ${id} created from ${input.channel === "sms" ? "an SMS" : "an email"}.`, at },
    ]);
  });
  await db
    .insert(t.ticketEvents)
    .values({ ticket: id, at, actor: input.client.id, actorName: input.client.name, action: "created", detail: { channel: input.channel } });
  return { ok: true, ticket: id, created: true };
}
