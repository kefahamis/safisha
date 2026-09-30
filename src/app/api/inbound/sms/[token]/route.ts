import { sql } from "drizzle-orm";
import { KE_MOBILE, normalisePhone } from "@/lib/clientNumber";
import { handOff } from "@/server/careBot";
import { receiveClientMessage } from "@/server/careMessages";
import { getDb, schema as t } from "@/server/db";
import { loadSetting } from "@/server/settings";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * Africa's Talking incoming-message callback. It posts form fields (from, to,
 * text, date, id, linkId) and only needs a 200 back. A client's SMS joins
 * their open ticket, or starts one, when their company is on Premium.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const cfg = await loadSetting("platform", "sms");
  if (!token || token !== cfg?.config.webhookToken) return new Response("Unknown callback.", { status: 403 });

  const form = await request.formData().catch(() => null);
  const from = String(form?.get("from") ?? "").replace(/\s/g, "");
  const text = String(form?.get("text") ?? "");
  if (!KE_MOBILE.test(from) || !text.trim()) return new Response("Ignored.");

  const db = await getDb();
  const digits = normalisePhone(from).replace(/\D/g, "");
  // A phone can hold more than one account; the newest one is the likeliest sender.
  const [client] = await db
    .select()
    .from(t.clients)
    .where(sql`regexp_replace(${t.clients.phone}, '\\D', '', 'g') = ${digits}`)
    .orderBy(sql`${t.clients.joined} desc`)
    .limit(1);
  if (!client) return new Response("Ignored.");

  const res = await receiveClientMessage({ client, channel: "sms", text });
  // Someone replying by SMS is talking to people, not the in-app assistant.
  if (res.ok) await handOff(res.ticket, "The client replied by SMS.");
  return new Response("OK");
}
