import { redirect } from "next/navigation";
import { landingFor, navFor } from "@/lib/navigation";
import { findUserById } from "@/server/accessStore";
import { getSession } from "@/server/session";

/**
 * Where a signed-in person starts: the page they picked on their Profile, if
 * they can still open it; otherwise the first section they can open, or
 * staff's own dashboard.
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const chosen = session.ws === "client" ? undefined : (await findUserById(session.sub))?.startPage;
  const allowed = chosen && navFor(session.ws, session.permissions).some((n) => n.href === chosen);
  redirect(allowed ? chosen : landingFor(session.ws, session.permissions));
}
