import { eq } from "drizzle-orm";
import { PLATFORM } from "@/lib/branding";
import { getDb, schema } from "@/server/db";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";
import { openFile } from "@/server/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Serves a stored photo to whoever uploaded it, or to anyone in its company.
 * The platform's own logo and tab icon are public: the sign-in page shows them.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = await getDb();
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id));
    if (!file) return new Response("Not found", { status: 404 });

    if (file.company === PLATFORM) {
      const body = await openFile(file);
      if (!body) return new Response("Not found", { status: 404 });
      return new Response(body, {
        headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=86400, immutable" },
      });
    }

    const session = await requireSession();

    const companies = await visibleCompanies(session);
    const allowed =
      file.owner === session.sub ||
      companies === null ||
      (file.company !== null && companies.includes(file.company));
    if (!allowed) return new Response("Not found", { status: 404 });

    // Stored in Blob or the database; either way it only leaves through this check.
    const body = await openFile(file);
    if (!body) return new Response("Not found", { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
