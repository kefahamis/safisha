import { verifyOtp } from "@/server/authFlows";
import { issueSession } from "@/server/signin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const user = await verifyOtp(String(body.phone ?? ""), String(body.code ?? ""));
  if (!user) return Response.json({ error: "That code is wrong or has expired." }, { status: 400 });
  const signed = await issueSession(user);
  if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
  return Response.json({ ok: true, workspace: signed.workspace });
}
