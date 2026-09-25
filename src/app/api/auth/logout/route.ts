import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/server/jwt";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  // Drop pages the offline cache kept for this person. The queued-work store
  // (IndexedDB) is left alone so unsynced collections aren't lost.
  return Response.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
}
