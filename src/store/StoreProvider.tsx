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
import type { AppData, AppState } from "@/lib/types";
import { createActions, type AppActions } from "./actions";
import { createAppStore, type AppStore } from "./appStore";

const StoreContext = createContext<AppStore | null>(null);

/** The signed-in identity, which pins the store's context to that person. */
export interface StoreScope {
  clientId?: string;
  companyId?: string;
  truckId?: string;
}

/**
 * Holds the session's slice of server data plus view-local state. The first
 * snapshot is rendered on the server and handed in, so there's no loading flash.
 */
export function StoreProvider({
  scope,
  initialData,
  children,
}: {
  scope?: StoreScope;
  initialData: AppData;
  children: ReactNode;
}) {
  const [store] = useState(() => {
    const firstClient = initialData.clients[0]?.id ?? "";
    const firstCompany = initialData.clients[0]?.company ?? initialData.trucks[0]?.company ?? "TS";
    const state: AppState = {
      ...initialData,
      companyId: scope?.companyId ?? firstCompany,
      clientId: scope?.clientId ?? firstClient,
      truckId: scope?.truckId ?? initialData.trucks[0]?.id ?? "",
      q: "",
      estateFilter: "",
      stmtPeriod: "all",
      stmtClient: null,
      selTicket: null,
      stk: null,
      elapsedMs: 0,
      pending: 0,
      online: true,
    };
    return createAppStore(state);
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

/** Advances the clock and every sharing truck once a second. */
export function useFleetTicker() {
  const actions = useActions();
  useEffect(() => {
    const id = window.setInterval(() => actions.tick(), 1000);
    return () => window.clearInterval(id);
  }, [actions]);
}

/**
 * Keeps the store in step with the server: a fresh snapshot every few seconds
 * while the tab is visible (so an M-Pesa callback shows up without a reload),
 * and a flush of any work queued while offline.
 */
export function useLiveSync(intervalMs = 5000) {
  const actions = useActions();
  useEffect(() => {
    let timer: number | undefined;
    const loop = async () => {
      if (document.visibilityState === "visible") {
        await actions.flush();
        await actions.refresh();
      }
      timer = window.setTimeout(loop, intervalMs);
    };
    timer = window.setTimeout(loop, intervalMs);

    const online = () => {
      void actions.flush().then(() => actions.refresh());
    };
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    void actions.flush();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [actions, intervalMs]);
}
