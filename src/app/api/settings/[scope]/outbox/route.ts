import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ scope: string }> };

/** Recent SMS: sent, simulated or failed. A company sees only its own. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { scope } = await params;
    await requireSettingsScope(scope);
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.smsOutbox)
      .where(scope === "platform" ? undefined : eq(schema.smsOutbox.company, scope))
      .orderBy(desc(schema.smsOutbox.id))
      .limit(60);
    return Response.json({
      messages: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
