import { ussdReply } from "@/server/ussd";
import { errorResponse, requirePermission } from "@/server/session";

export const runtime = "nodejs";

/** The in-app USSD tester on the settings page: same menu, no telco. */
export async function POST(request: Request) {
  try {
    await requirePermission("settings.platform.manage");
    const body = await request.json().catch(() => ({}));
    const phone = String(body.phone ?? "");
    if (!phone) return Response.json({ error: "Enter a phone number." }, { status: 400 });
    return Response.json({ reply: await ussdReply({ phone, text: String(body.text ?? "") }) });
  } catch (err) {
    return errorResponse(err);
  }
}
