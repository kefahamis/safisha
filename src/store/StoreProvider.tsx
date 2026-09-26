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
 * Keeps the store in step with the server while the tab is visible (so an
 * M-Pesa callback shows up without a reload), and flushes work queued offline.
 *
 * Each poll sends the version it holds and costs the server one small query
 * when nothing changed. While things stay quiet the gap stretches from
 * `intervalMs` to `maxMs`; any change, returning to the tab or coming back
 * online snaps it back.
 */
export function useLiveSync(intervalMs = 5000, maxMs = 20000) {
  const actions = useActions();
  useEffect(() => {
    let timer: number | undefined;
    let gap = intervalMs;
    const loop = async () => {
      if (document.visibilityState === "visible") {
        await actions.flush();
        const changed = await actions.refresh();
        gap = changed ? intervalMs : Math.min(maxMs, Math.round(gap * 1.5));
      }
      timer = window.setTimeout(loop, gap);
    };
    timer = window.setTimeout(loop, gap);

    const online = () => {
      gap = intervalMs;
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
  }, [actions, intervalMs, maxMs]);
}
