import { resetPassword } from "@/server/authFlows";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";

/** Checks the code, sets the new password and signs the person in. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await resetPassword(String(body.identifier ?? ""), String(body.code ?? ""), String(body.password ?? ""));
  if (!res.ok || !res.user) return Response.json({ error: res.error }, { status: 400 });
  const signed = await issueSession(res.user);
  if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
  return Response.json({ ok: true, workspace: signed.workspace, mfa: signed.mfa });
}
