import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/server/jwt";
import { revokeSession } from "@/server/sessions";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value ?? "");
  if (claims?.sid) await revokeSession(claims.sid, claims.sub);
  jar.delete(SESSION_COOKIE);
  // Drop pages the offline cache kept for this person. The queued-work store
  // (IndexedDB) is left alone so unsynced collections aren't lost.
  return Response.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
}
