import { eq } from "drizzle-orm";
import { PLATFORM } from "@/lib/branding";
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
    // Only the platform has a product name; a company is named by its record.
    if (company !== PLATFORM) delete branding.name;

    // Any file referenced must be one uploaded for this company.
    const db = await getDb();
    for (const [field, label] of [["logo", "logo"], ["favicon", "tab icon"]] as const) {
      const id = branding[field];
      if (!id) continue;
      const [file] = await db
        .select({ company: schema.files.company })
        .from(schema.files)
        .where(eq(schema.files.id, id));
      if (!file || file.company !== company) throw new HttpError(400, `Upload the ${label} again.`);
    }

    await saveBranding(company, branding, session.sub);
    await audit(session, {
      action: "branding.update",
      target: company,
      company,
      detail: {
        primary: branding.primary,
        rail: branding.rail,
        logo: branding.logo ? "set" : "none",
        favicon: branding.faviconMode ?? "none",
        tagline: branding.tagline,
        name: branding.name,
      },
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
