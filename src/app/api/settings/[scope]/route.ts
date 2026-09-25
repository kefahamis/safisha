import { INTEGRATIONS } from "@/lib/integrations";
import { viewOf } from "@/server/settings";
import { requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ scope: string }> };

/** Every integration in one scope, as the settings screen shows it. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { scope } = await params;
    await requireSettingsScope(scope);
    const kind = scope === "platform" ? "platform" : "company";
    const views = await Promise.all(
      INTEGRATIONS.filter((i) => i.scope === kind).map((i) => viewOf(scope, i.key)),
    );
    // What company admins need to know about platform-managed pieces, without secrets.
    const [app, sms, email, ai] = await Promise.all(
      (["app", "sms", "email", "ai"] as const).map((k) => viewOf("platform", k)),
    );
    const platform = {
      publicBaseUrl: String(app.config.publicBaseUrl ?? "") || null,
      sms: sms.status,
      email: email.status,
      ai: ai.status,
    };
    return Response.json(
      { scope, integrations: views, platform },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
