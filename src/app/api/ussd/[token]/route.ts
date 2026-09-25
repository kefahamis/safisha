import { loadSetting } from "@/server/settings";
import { ussdReply } from "@/server/ussd";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * Africa's Talking USSD callback. It posts form fields (sessionId, serviceCode,
 * phoneNumber, text) and expects plain text starting with CON or END.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const cfg = await loadSetting("platform", "ussd");
  if (!cfg?.config.enabled || !token || token !== cfg.config.webhookToken) {
    return new Response("END Service unavailable.", { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  const form = await request.formData().catch(() => null);
  const phone = String(form?.get("phoneNumber") ?? "");
  const text = String(form?.get("text") ?? "");
  if (!phone) {
    return new Response("END Missing phone number.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const reply = await ussdReply({ phone, text });
  return new Response(reply, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
