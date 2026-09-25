import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getSession } from "@/server/session";

/**
 * Everything under here needs a session. Middleware already turns anonymous
 * traffic away; this is the second check, for the case where the account was
 * suspended after the token was issued.
 */
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
