"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Session } from "@/lib/auth/types";

interface SessionValue {
  session: Session | null;
  /** True when the signed-in user holds every listed permission. */
  can: (...permissions: string[]) => boolean;
  /** True when they hold at least one. */
  canAny: (...permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  can: () => false,
  canAny: () => false,
});

export function SessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const value = useMemo<SessionValue>(() => {
    const held = new Set(session?.permissions ?? []);
    return {
      session,
      can: (...permissions) => permissions.every((p) => held.has(p)),
      canAny: (...permissions) => permissions.some((p) => held.has(p)),
    };
  }, [session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/**
 * Hides its children unless the session carries the permission. This is a
 * convenience for the UI only — the server checks again on every write.
 */
export function Can({
  permission,
  any,
  fallback = null,
  children,
}: {
  permission?: string;
  any?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = useSession();
  const allowed = permission ? can(permission) : any ? canAny(...any) : false;
  return <>{allowed ? children : fallback}</>;
}
