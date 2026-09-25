import { integrationDef } from "@/lib/integrations";
import { audit } from "@/server/audit";
import { testEmail, testSms } from "@/server/integrations/messaging";
import { testAi } from "@/server/integrations/translate";
import { testMpesa } from "@/server/payments";
import { loadSetting, setStatus, viewOf } from "@/server/settings";
import { asKey, requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ scope: string; key: string }> };

/**
 * Tests the saved credentials against the provider. A pass is what switches
 * an integration live: until then, payments and SMS stay simulated.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { scope, key } = await params;
    const session = await requireSettingsScope(scope, key);
    const def = integrationDef(key)!;
    if (!def.testable) return Response.json({ error: "This setting has nothing to test." }, { status: 400 });

    const saved = await loadSetting(scope, asKey(key));
    let result: { ok: boolean; detail: string };

    switch (key) {
      case "mpesa":
        result = await testMpesa(scope);
        break;
      case "sms":
        result =
          saved?.secrets.apiKey && saved.config.username
            ? await testSms({
                environment: String(saved.config.environment ?? "sandbox"),
                username: String(saved.config.username),
                apiKey: saved.secrets.apiKey,
              })
            : { ok: false, detail: "Save the username and API key first." };
        break;
      case "email":
        result = saved?.secrets.apiKey
          ? saved.config.from
            ? await testEmail(saved.secrets.apiKey)
            : { ok: false, detail: "Enter the from address first." }
          : { ok: false, detail: "Save the API key first." };
        break;
      case "ai":
        result = saved?.secrets.apiKey
          ? await testAi(saved.secrets.apiKey, String(saved.config.model || "claude-opus-5"))
          : { ok: false, detail: "Save the API key first." };
        break;
      default:
        result = { ok: false, detail: "Not testable." };
    }

    await setStatus(scope, asKey(key), result.ok, result.detail);
    await audit(session, {
      action: result.ok ? "settings.test.pass" : "settings.test.fail",
      target: `${scope}/${key}`,
      company: scope === "platform" ? null : scope,
      detail: { integration: def.title, result: result.detail },
    });
    return Response.json({ ...result, integration: await viewOf(scope, asKey(key)) });
  } catch (err) {
    return errorResponse(err);
  }
}
