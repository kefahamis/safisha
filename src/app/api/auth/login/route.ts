import { findUserByEmail } from "@/server/accessStore";
import { verifyPassword } from "@/server/password";
import { issueSession } from "@/server/signin";

// scrypt needs the Node runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "Enter an email and password." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  // Same message either way — don't reveal which addresses have accounts.
  const invalid = Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  if (!user || !verifyPassword(password, user.passwordHash)) return invalid;

  const signed = await issueSession(user);
  if (!signed.ok) return Response.json({ error: signed.error }, { status: signed.status });
  return Response.json({ ok: true, workspace: signed.workspace });
}
