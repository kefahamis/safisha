import { redirect } from "next/navigation";
import { landingFor } from "@/lib/navigation";
import { getSession } from "@/server/session";

/** Where a signed-in person starts: the first section they can open, or staff's own dashboard. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? landingFor(session.ws, session.permissions) : "/login");
}
