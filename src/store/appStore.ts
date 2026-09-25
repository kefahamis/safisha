import type { AppData, AppState } from "@/lib/types";

/**
 * A minimal observable store. State is mutated in place and a version counter
 * drives re-renders through `useSyncExternalStore`. Server data arrives as whole
 * snapshots; view-local state (filters, selections, the payment sheet) stays.
 */
export interface AppStore {
  getState: () => AppState;
  getVersion: () => number;
  subscribe: (listener: () => void) => () => void;
  update: (mutate: (state: AppState) => void) => void;
  /** Replaces the server-owned half of the state with a fresh snapshot. */
  receive: (data: AppData) => void;
}

export function createAppStore(initial: AppState): AppStore {
  const state = initial;
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version++;
    listeners.forEach((l) => l());
  };

  return {
    getState: () => state,
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(mutate) {
      mutate(state);
      notify();
    },
    receive(data) {
      Object.assign(state, data, { elapsedMs: 0 });
      notify();
    },
  };
}
