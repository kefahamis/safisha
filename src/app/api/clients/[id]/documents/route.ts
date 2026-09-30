import { asc, eq } from "drizzle-orm";
import type { ClientDocument, ClientDocumentKind } from "@/lib/clientDocuments";
import { getDb, schema } from "@/server/db";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The documents on file for one client, for staff who can see its company. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requirePermission("clients.view");
    const db = await getDb();
    const [client] = await db
      .select({ company: schema.clients.company })
      .from(schema.clients)
      .where(eq(schema.clients.id, id));
    const companies = await visibleCompanies(session);
    if (!client || (companies !== null && !companies.includes(client.company))) {
      return Response.json({ error: "No such client." }, { status: 404 });
    }

    const rows = await db
      .select()
      .from(schema.clientDocuments)
      .where(eq(schema.clientDocuments.client, id))
      .orderBy(asc(schema.clientDocuments.id));
    const documents: ClientDocument[] = rows.map((r) => ({
      id: r.id,
      file: r.file,
      kind: r.kind as ClientDocumentKind,
      name: r.name,
      mime: r.mime,
      size: r.size,
      uploadedAt: r.uploadedAt,
      uploadedBy: r.uploadedBy,
    }));
    return Response.json({ documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
