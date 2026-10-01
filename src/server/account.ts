// Server-only. A person's own account: what the Profile page shows, and the preferences it saves.
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Session, User } from "@/lib/auth/types";
import { KE_MOBILE, normalisePhone } from "@/lib/clientNumber";
import { navFor } from "@/lib/navigation";
import { CLIENT_NOTICES, type ClientNotice, type ProfileView, type Theme } from "@/lib/profile";
import { companyById } from "@/lib/reference/companies";
import { audit } from "./audit";
import { getDb, schema as t, type Db } from "./db";
import { nextPrefixedId } from "./ids";
import { securityView } from "./mfa";
import { HttpError } from "./session";
import { nowStamp } from "./time";

const THEMES: Theme[] = ["system", "light", "dark"];

/** Staff can pick where they land; clients always start on their account. */
const startOptions = (session: Session) =>
  session.ws === "client" ? [] : navFor(session.ws, session.permissions).map((n) => ({ href: n.href, label: n.label }));

/** Someone who answers clients: they get a signature and an away switch. */
const isAgent = (session: Session) => session.ws === "company" && session.permissions.includes("tickets.reply");

export async function profileView(session: Session, user: User): Promise<ProfileView> {
  const db = await getDb();
  const sec = await securityView(user);
  const view: ProfileView = {
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    emailVerified: sec.emailVerified,
    phoneVerified: Boolean(user.phoneVerifiedAt) || sec.factors.some((f) => f.method === "sms"),
    emailCodesOn: sec.factors.some((f) => f.method === "email"),
    smsCodesOn: sec.factors.some((f) => f.method === "sms"),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    photo: user.photo,
    lang: user.lang === "sw" ? "sw" : "en",
    theme: THEMES.includes(user.theme as Theme) ? (user.theme as Theme) : "system",
    onboardingHidden: Boolean(
      (await db.select({ o: t.users.onboarding }).from(t.users).where(eq(t.users.id, user.id)))[0]?.o.hiddenAt,
    ),
  };
  const options = startOptions(session);
  if (options.length) {
    view.startOptions = options;
    view.startPage = user.startPage && options.some((o) => o.href === user.startPage) ? user.startPage : undefined;
  }
  if (isAgent(session)) view.agent = { signature: user.signature ?? "", away: Boolean(user.away) };
  if (session.ws === "client" && user.scope.clientId) {
    const [c] = await db.select().from(t.clients).where(eq(t.clients.id, user.scope.clientId));
    if (c) {
      const notify = Object.fromEntries(CLIENT_NOTICES.map((n) => [n.key, c.notify[n.key] !== false])) as Record<ClientNotice, boolean>;
      view.client = { notify, mpesaPhone: c.mpesaPhone ?? "", contactPhone: c.phone, company: companyById(c.company).name };
    }
  }
  return view;
}

export const PreferencesBody = z.object({
  lang: z.enum(["en", "sw"]).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  /** A files id the person uploaded, or null to go back to initials. */
  photo: z.string().max(60).nullable().optional(),
  /** A page from their menu, or null for the usual one. */
  startPage: z.string().max(80).nullable().optional(),
  signature: z.string().max(200, "Keep the signature under 200 characters.").optional(),
  away: z.boolean().optional(),
  notify: z.record(z.string(), z.boolean()).optional(),
  /** Blank to use the contact number. */
  mpesaPhone: z.string().max(20).optional(),
});

/** Saves whichever preferences were sent; each is checked against what this person may set. */
export async function savePreferences(session: Session, user: User, input: z.infer<typeof PreferencesBody>) {
  const db = await getDb();
  const set: Partial<typeof t.users.$inferInsert> = {};
  const changed: string[] = [];

  if (input.lang !== undefined) set.lang = input.lang;
  if (input.theme !== undefined) set.theme = input.theme;
  if (input.photo !== undefined) {
    if (input.photo !== null) {
      const [file] = await db.select().from(t.files).where(eq(t.files.id, input.photo));
      if (!file || file.owner !== user.id || !file.mime.startsWith("image/")) throw new HttpError(400, "Upload the photo first.");
    }
    set.photo = input.photo;
    changed.push("photo");
  }
  if (input.startPage !== undefined) {
    if (input.startPage !== null && !startOptions(session).some((o) => o.href === input.startPage)) {
      throw new HttpError(400, "Pick a page from your menu.");
    }
    set.startPage = input.startPage;
  }
  if (input.signature !== undefined || input.away !== undefined) {
    if (!isAgent(session)) throw new HttpError(403, "Only care agents have a signature and away status.");
    if (input.signature !== undefined) set.signature = input.signature.trim();
    if (input.away !== undefined) {
      set.away = input.away;
      changed.push(input.away ? "away" : "back");
    }
  }
  if (Object.keys(set).length) await db.update(t.users).set(set).where(eq(t.users.id, user.id));

  if (input.notify !== undefined || input.mpesaPhone !== undefined) {
    if (session.ws !== "client" || !user.scope.clientId) throw new HttpError(403, "Only clients have these settings.");
    const cset: Partial<typeof t.clients.$inferInsert> = {};
    if (input.notify !== undefined) {
      cset.notify = Object.fromEntries(
        CLIENT_NOTICES.filter((n) => typeof input.notify![n.key] === "boolean").map((n) => [n.key, input.notify![n.key]]),
      );
      changed.push("notifications");
    }
    if (input.mpesaPhone !== undefined) {
      const raw = input.mpesaPhone.replace(/\s/g, "");
      if (raw && !KE_MOBILE.test(raw)) throw new HttpError(400, "Enter a Safaricom number like 0712 345 678.");
      cset.mpesaPhone = raw ? normalisePhone(raw) : null;
      changed.push("mpesa number");
    }
    await db.update(t.clients).set(cset).where(eq(t.clients.id, user.scope.clientId));
  }

  // Appearance and language are the person's own business; the rest is worth a line in the log.
  if (changed.length) await audit(session, { action: "profile.preferences", target: user.email, detail: { changed } });
}

/**
 * Everything the platform holds about this person, as one JSON document: the
 * Data Protection Act's right of access. Clients get their account, bills,
 * collections and conversations; staff get their profile, sign-ins and actions.
 */
export async function exportMyData(session: Session, user: User) {
  const db = await getDb();
  const { passwordHash: _h, ...profile } = user;
  const signIns = await db.select().from(t.sessions).where(eq(t.sessions.user, user.id)).orderBy(desc(t.sessions.createdAt));
  const out: Record<string, unknown> = {
    exportedAt: nowStamp(),
    profile: { ...profile, recoveryCodes: undefined },
    signIns: signIns.map((s) => ({ at: s.createdAt, lastSeen: s.lastSeenAt, ip: s.ip, device: s.userAgent, method: s.method, endedAt: s.revokedAt })),
  };

  const clientId = user.scope.clientId;
  if (session.ws === "client" && clientId) {
    const [client, txns, pickups, requests, tickets, documents] = await Promise.all([
      db.select().from(t.clients).where(eq(t.clients.id, clientId)),
      db.select().from(t.txns).where(eq(t.txns.client, clientId)),
      db.select().from(t.pickups).where(eq(t.pickups.client, clientId)),
      db.select().from(t.pickupRequests).where(eq(t.pickupRequests.client, clientId)),
      db.select().from(t.tickets).where(eq(t.tickets.client, clientId)),
      db.select().from(t.clientDocuments).where(eq(t.clientDocuments.client, clientId)),
    ]);
    const messages = tickets.length
      ? await db
          .select()
          .from(t.ticketMessages)
          // Staff notes are the company's, not the client's.
          .where(and(inArray(t.ticketMessages.ticket, tickets.map((x) => x.id)), ne(t.ticketMessages.from, "note")))
      : [];
    Object.assign(out, {
      account: client[0],
      statement: txns,
      collections: pickups,
      pickupRequests: requests.map(({ commissionRate: _c, ...r }) => r),
      conversations: tickets.map((tk) => ({
        id: tk.id,
        subject: tk.subject,
        status: tk.status,
        createdAt: tk.createdAt,
        messages: messages.filter((m) => m.ticket === tk.id).map((m) => ({ from: m.from, text: m.text, at: m.at })),
      })),
      documents: documents.map((d) => ({ kind: d.kind, name: d.name, uploadedAt: d.uploadedAt })),
    });
  } else {
    const actions = await db
      .select()
      .from(t.auditLog)
      .where(eq(t.auditLog.actor, user.id))
      .orderBy(desc(t.auditLog.id))
      .limit(2000);
    out.actions = actions.map((a) => ({ at: a.at, action: a.action, target: a.target, ip: a.ip }));
  }
  await audit(session, { action: "profile.export", target: user.email });
  return out;
}

/**
 * A client asking to have their account and personal data erased. It goes to
 * the company's care desk as a ticket: records the law requires (five years of
 * billing for KRA) are kept, and the rest is removed by the company.
 */
export async function requestDeletion(session: Session, user: User, reason: string) {
  if (session.ws !== "client" || !user.scope.clientId) {
    throw new HttpError(400, "Staff accounts are closed by your company or platform admin. Ask them to remove it.");
  }
  const db = await getDb();
  const [client] = await db.select().from(t.clients).where(eq(t.clients.id, user.scope.clientId));
  if (!client) throw new HttpError(404, "No such account.");
  const [open] = await db
    .select({ id: t.tickets.id })
    .from(t.tickets)
    .where(and(eq(t.tickets.client, client.id), eq(t.tickets.subject, "Account deletion request"), ne(t.tickets.status, "Resolved")));
  if (open) return { ticket: open.id, already: true };

  const at = nowStamp();
  let id = "";
  await db.transaction(async (tx) => {
    id = await nextPrefixedId(tx as unknown as Db, t.tickets, "T-", 1045);
    await tx.insert(t.tickets).values({
      id,
      client: client.id,
      company: client.company,
      cat: "Other",
      subject: "Account deletion request",
      status: "Open",
      priority: "high",
      createdAt: at,
    });
    await tx.insert(t.ticketMessages).values([
      {
        ticket: id,
        from: "client",
        text: `Please close my account and delete my personal data.${reason.trim() ? `\n\nReason: ${reason.trim().slice(0, 500)}` : ""}`,
        at,
      },
      {
        ticket: id,
        from: "sys",
        text: `Request ${id} sent to ${companyById(client.company).name}. Billing records are kept for five years as the law requires; everything else is removed once any balance is settled.`,
        at,
      },
    ]);
  });
  await db.insert(t.ticketEvents).values({ ticket: id, at, actor: user.id, actorName: user.name, action: "created", detail: { channel: "app" } });
  await audit(session, { action: "profile.deletion_request", target: client.id, company: client.company, detail: { ticket: id } });
  return { ticket: id, already: false };
}
