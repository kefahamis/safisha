import { eq } from "drizzle-orm";
import { audit } from "@/server/audit";
import { clean, clearBranding, saveBranding } from "@/server/branding";
import { getDb, schema } from "@/server/db";
import { errorResponse, HttpError } from "@/server/session";
import { requireSettingsScope } from "@/server/settingsAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ company: string }> };

/** Save a company's logo and colours. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSettingsScope(company);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "Nothing to save.");
    const branding = clean(body as Record<string, unknown>);

    if (branding.logo) {
      const db = await getDb();
      const [file] = await db
        .select({ company: schema.files.company, owner: schema.files.owner })
        .from(schema.files)
        .where(eq(schema.files.id, branding.logo));
      if (!file || file.company !== company) throw new HttpError(400, "Upload the logo again.");
    }

    await saveBranding(company, branding, session.sub);
    await audit(session, {
      action: "branding.update",
      target: company,
      company,
      detail: { primary: branding.primary, rail: branding.rail, logo: branding.logo ? "set" : "none" },
    });
    return Response.json({ branding });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Back to the platform look. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { company } = await params;
    const session = await requireSettingsScope(company);
    await clearBranding(company);
    await audit(session, { action: "branding.reset", target: company, company });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
