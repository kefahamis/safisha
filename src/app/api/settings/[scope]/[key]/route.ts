import { integrationDef } from "@/lib/integrations";
import { audit } from "@/server/audit";
import { saveSetting, viewOf } from "@/server/settings";
import { asKey, requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ scope: string; key: string }> };

/**
 * Saves one integration. Secret fields are only replaced when a new value is
 * typed; the audit log records which fields changed, never their values.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { scope, key } = await params;
    const session = await requireSettingsScope(scope, key);
    const body = await request.json().catch(() => ({}));

    const config = typeof body.config === "object" && body.config ? body.config : {};
    const secrets: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.secrets ?? {})) {
      if (typeof v === "string") secrets[k] = v;
    }
    const clear = Array.isArray(body.clear) ? body.clear.map(String) : [];

    const def = integrationDef(key)!;
    for (const f of def.fields) {
      if (f.type === "url" && config[f.name]) {
        try {
          const u = new URL(String(config[f.name]));
          if (u.protocol !== "https:" && !u.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
            return Response.json({ error: `${f.label} must start with https://` }, { status: 400 });
          }
        } catch {
          return Response.json({ error: `${f.label} isn't a valid address.` }, { status: 400 });
        }
      }
    }

    const { changed } = await saveSetting(scope, asKey(key), { config, secrets, clear }, session.name);
    if (changed.length) {
      await audit(session, {
        action: "settings.save",
        target: `${scope}/${key}`,
        company: scope === "platform" ? null : scope,
        detail: { integration: def.title, changed },
      });
    }
    return Response.json({ integration: await viewOf(scope, asKey(key)), changed });
  } catch (err) {
    return errorResponse(err);
  }
}
