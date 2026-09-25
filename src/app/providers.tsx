"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { PlatformBrandProvider } from "@/components/layout/PlatformBrand";
import type { Session } from "@/lib/auth/types";
import type { Branding } from "@/lib/branding";
import { LangProvider } from "@/lib/i18n";

/**
 * One session and one toast queue for the whole app. The data store lives in
 * the signed-in layout, which loads the session's snapshot on the server.
 */
export function Providers({
  session,
  platform,
  children,
}: {
  session: Session | null;
  platform: Branding;
  children: ReactNode;
}) {
  return (
    <PlatformBrandProvider branding={platform}>
    <SessionProvider session={session}>
      <LangProvider initial={session?.lang === "sw" ? "sw" : "en"}>
        <ToastProvider>{children}</ToastProvider>
      </LangProvider>
    </SessionProvider>
    </PlatformBrandProvider>
  );
}
