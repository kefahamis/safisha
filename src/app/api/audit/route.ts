import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The audit log. A company admin sees their own company's entries; the
 * platform admin sees everything, including platform-level changes.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("audit.view");
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const db = await getDb();
    const a = schema.auditLog;

    const scope = session.scope.companyId ? eq(a.company, session.scope.companyId) : undefined;
    const search = q
      ? or(ilike(a.action, `%${q}%`), ilike(a.actorName, `%${q}%`), ilike(a.target, `%${q}%`))
      : undefined;

    const rows = await db
      .select()
      .from(a)
      .where(and(scope, search))
      .orderBy(desc(a.id))
      .limit(200);

    return Response.json({
      entries: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
      platformWide: !session.scope.companyId,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

