import { sql } from "drizzle-orm";
import { handOff } from "@/server/careBot";
import { receiveClientMessage } from "@/server/careMessages";
import { getDb, schema as t } from "@/server/db";
import { loadSetting } from "@/server/settings";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

interface InboundEmail {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  email_id?: string;
  id?: string;
}

/** "Wanjiku <wanjiku@example.com>" -> "wanjiku@example.com" */
const address = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

/** The new part of a reply: drop the quoted thread below it. */
function replyText(body: string) {
  const lines: string[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From: /i.test(line)) break;
    if (line.startsWith(">")) continue;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

const stripHtml = (html: string) =>
  html
    .replace(/<(br|\/p|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Resend's receive event carries the envelope; the body may need fetching by id. */
async function bodyOf(email: InboundEmail): Promise<string> {
  if (email.text) return email.text;
  if (email.html) return stripHtml(email.html);
  const id = email.email_id ?? email.id;
  const cfg = await loadSetting("platform", "email");
  if (!id || !cfg?.secrets.apiKey) return "";
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${cfg.secrets.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return "";
  const full = (await res.json().catch(() => ({}))) as InboundEmail;
  return full.text ?? (full.html ? stripHtml(full.html) : "");
}

/**
 * Inbound email webhook (Resend's "email.received" event, or any relay that
 * posts JSON with from, subject and text). A client's reply joins the ticket
 * named in the subject, when their company is on Premium.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const cfg = await loadSetting("platform", "email");
  if (!token || token !== cfg?.config.webhookToken) return new Response("Unknown callback.", { status: 403 });

  const payload = (await request.json().catch(() => null)) as { type?: string; data?: InboundEmail } & InboundEmail | null;
  if (!payload) return new Response("Expected JSON.", { status: 400 });
  if (payload.type && payload.type !== "email.received") return new Response("Ignored.");
  const email: InboundEmail = payload.data ?? payload;
  if (!email.from) return new Response("Ignored.");

  const db = await getDb();
  const [user] = await db
    .select({ clientId: sql<string>`${t.users.scope}->>'clientId'` })
    .from(t.users)
    .where(sql`lower(${t.users.email}) = ${address(email.from)} and ${t.users.scope} ? 'clientId'`)
    .limit(1);
  if (!user?.clientId) return new Response("Ignored.");
  const [client] = await db.select().from(t.clients).where(sql`${t.clients.id} = ${user.clientId}`);
  if (!client) return new Response("Ignored.");

  const text = replyText(await bodyOf(email));
  const res = await receiveClientMessage({ client, channel: "email", text, subject: email.subject });
  if (res.ok) await handOff(res.ticket, "The client replied by email.");
  return new Response("OK");
}
