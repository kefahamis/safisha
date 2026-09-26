import { findUserById } from "@/server/accessStore";
import { audit } from "@/server/audit";
import { platformIdentity } from "@/server/branding";
import { sendEmail, sendSms } from "@/server/integrations/messaging";
import { requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse, HttpError } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ scope: string; key: string }> };

/**
 * Sends a real message to the admin themselves, through the live provider.
 * "Test connection" proves the keys sign in; this proves a message actually
 * arrives on a phone or in an inbox, which is what clients depend on.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { scope, key } = await params;
    if (scope !== "platform" || (key !== "sms" && key !== "email")) throw new HttpError(400, "Only SMS and email send test messages.");
    const session = await requireSettingsScope(scope, key);
    const me = await findUserById(session.sub);
    const name = (await platformIdentity()).name;

    let to: string;
    let res: { status: string; error?: string | null };
    if (key === "sms") {
      if (!me?.phone) throw new HttpError(400, "Add a phone number to your account to receive the test SMS.");
      to = me.phone;
      res = await sendSms({ to, purpose: "test", body: `${name}: test message. If you can read this, SMS is working.` });
    } else {
      to = session.email;
      res = await sendEmail({
        to,
        subject: `${name}: test email`,
        text: `If you can read this, email from ${name} is reaching inboxes.`,
      });
    }

    const ok = res.status === "sent";
    await audit(session, { action: ok ? "settings.send-test.pass" : "settings.send-test.fail", target: `${scope}/${key}`, detail: { to, ...res } });
    const detail = ok
      ? `Sent to ${to}. Check it arrived; delivery can take a minute.`
      : res.status === "simulated"
        ? "Not connected yet: test the connection first."
        : `The provider refused it: ${res.error ?? "unknown error"}.`;
    return Response.json({ ok, detail });
  } catch (err) {
    return errorResponse(err);
  }
}
