import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { acceptInvite } from "@/server/authFlows";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";

/** Turns an invitation into an account, with the password the person chose. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await acceptInvite(String(body.email ?? ""), String(body.token ?? ""), String(body.password ?? ""));
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  await audit(
    { ...SYSTEM_ACTOR, sub: res.user.id, name: res.user.name },
    { action: "user.invite.accept", target: res.user.id, company: res.user.scope.companyId ?? null },
  );
  const signed = await issueSession(res.user);
  if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
  return Response.json({ ok: true, workspace: signed.workspace });
}
