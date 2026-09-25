import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SIDEBAR_COOKIE } from "@/lib/navigation";
import { buildSnapshot } from "@/server/snapshot";
import { getSession } from "@/server/session";
import { StoreProvider } from "@/store/StoreProvider";

// Every page here reads live data for the signed-in person.
export const dynamic = "force-dynamic";

/**
 * Everything under here needs a session. Middleware already turns anonymous
 * traffic away; this is the second check, for the case where the account was
 * suspended after the token was issued.
 */
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const snapshot = await buildSnapshot(session);
  // Read on the server so the page is drawn at the right width, with no jump.
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <StoreProvider scope={session.scope} initialData={snapshot}>
      <AppShell sidebarCollapsed={collapsed}>{children}</AppShell>
    </StoreProvider>
  );
}
