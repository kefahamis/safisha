"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { StoreProvider } from "@/store/StoreProvider";
import type { Session } from "@/lib/auth/types";

/**
 * One session, one demo store and one toast queue for the whole app. The store
 * is pinned to whoever is signed in, so a client sees their own account and a
 * company user their own company.
 */
export function Providers({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionProvider session={session}>
      <StoreProvider scope={session?.scope}>
        <ToastProvider>{children}</ToastProvider>
      </StoreProvider>
    </SessionProvider>
  );
}
