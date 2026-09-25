import { redirect } from "next/navigation";
import { landingFor } from "@/lib/navigation";
import { getSession } from "@/server/session";

/** Middleware normally handles "/"; this covers the case where it is bypassed. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? landingFor(session.ws, session.permissions) : "/login");
}
