import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Serves a stored photo to whoever uploaded it, or to anyone in its company. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const db = await getDb();
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id));
    if (!file) return new Response("Not found", { status: 404 });

    const companies = await visibleCompanies(session);
    const allowed =
      file.owner === session.sub ||
      companies === null ||
      (file.company !== null && companies.includes(file.company));
    if (!allowed) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
