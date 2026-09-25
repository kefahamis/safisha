"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AppState } from "@/lib/types";
import { createActions, type AppActions } from "./actions";
import { createAppStore, type AppStore } from "./appStore";

const StoreContext = createContext<AppStore | null>(null);

/** The signed-in identity, which pins the store's context to that person. */
export interface StoreScope {
  clientId?: string;
  companyId?: string;
  truckId?: string;
}

export function StoreProvider({
  scope,
  children,
}: {
  scope?: StoreScope;
  children: ReactNode;
}) {
  const [store] = useState(() => {
    const created = createAppStore();
    // Seeded defaults stand in only when the session doesn't pin an identity.
    created.update((s) => {
      if (scope?.clientId) s.clientId = scope.clientId;
      if (scope?.companyId) s.companyId = scope.companyId;
      if (scope?.truckId) s.truckId = scope.truckId;
    });
    return created;
  });
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

/**
 * Subscribes to the store and returns the live state object. The snapshot is a
 * version counter, so in-place mutations still re-render every subscriber.
 */
export function useAppState(): AppState {
  const store = useStore();
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  return store.getState();
}

export function useActions(): AppActions {
  const store = useStore();
  return useMemo(() => createActions(store), [store]);
}

/** Advances the demo clock and every sharing truck once a second. */
export function useFleetTicker() {
  const actions = useActions();
  useEffect(() => {
    const id = window.setInterval(() => actions.tick(), 1000);
    return () => window.clearInterval(id);
  }, [actions]);
}
