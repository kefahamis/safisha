"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import type { Session } from "@/lib/auth/types";
import { LangProvider } from "@/lib/i18n";

/**
 * One session and one toast queue for the whole app. The data store lives in
 * the signed-in layout, which loads the session's snapshot on the server.
 */
export function Providers({ session, children }: { session: Session | null; children: ReactNode }) {
  return (
    <SessionProvider session={session}>
      <LangProvider initial={session?.lang === "sw" ? "sw" : "en"}>
        <ToastProvider>{children}</ToastProvider>
      </LangProvider>
    </SessionProvider>
  );
}
