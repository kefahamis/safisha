import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { translate, TranslateError, type TargetLang } from "@/server/integrations/translate";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";

const TARGETS: TargetLang[] = ["en", "sw", "sheng"];

/**
 * Translates one care message for the person reading it. AI results are
 * cached on the message, so the second reader (or a second click) is free.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("tickets.translate");
    const body = await request.json().catch(() => ({}));
    const target = TARGETS.includes(body.target) ? (body.target as TargetLang) : "en";
    const db = await getDb();

    // Either an existing message, or a draft the agent wants to send in the client's language.
    if (typeof body.text === "string") {
      const text = body.text.trim().slice(0, 2000);
      if (!text) return Response.json({ error: "Nothing to translate." }, { status: 400 });
      return Response.json({ translation: await translate(text, target) });
    }

    const id = Number(body.messageId);
    const [msg] = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.id, id));
    if (!msg) return Response.json({ error: "No such message." }, { status: 404 });
    const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, msg.ticket));
    const companies = await visibleCompanies(session);
    const allowed =
      session.ws === "client"
        ? ticket?.client === session.scope.clientId
        : companies === null || (ticket && companies.includes(ticket.company));
    if (!ticket || !allowed) return Response.json({ error: "No such message." }, { status: 404 });

    const cached = msg.translations?.[target];
    if (cached) return Response.json({ translation: cached, cached: true });

    const prior = await db
      .select({ text: schema.ticketMessages.text, from: schema.ticketMessages.from })
      .from(schema.ticketMessages)
      .where(and(eq(schema.ticketMessages.ticket, msg.ticket), lt(schema.ticketMessages.id, msg.id)));
    const context = prior
      .filter((p) => p.from !== "sys")
      .slice(-3)
      .map((p) => `${p.from === "agent" ? "Care desk" : "Client"}: ${p.text}`);

    const translation = await translate(msg.text, target, context);
    if (translation.source === "ai") {
      await db
        .update(schema.ticketMessages)
        .set({ translations: { ...(msg.translations ?? {}), [target]: translation } })
        .where(eq(schema.ticketMessages.id, msg.id));
    }
    return Response.json({ translation });
  } catch (err) {
    if (err instanceof TranslateError) return Response.json({ error: err.message }, { status: 502 });
    return errorResponse(err);
  }
}
