import { createInitialState } from "@/lib/seed";
import type { AppState } from "@/lib/types";

/**
 * A minimal observable store. State is mutated in place and a version counter
 * drives re-renders through `useSyncExternalStore`, which keeps the ported
 * mutation-heavy logic readable without pulling in a state library.
 */
export interface AppStore {
  getState: () => AppState;
  getVersion: () => number;
  subscribe: (listener: () => void) => () => void;
  update: (mutate: (state: AppState) => void) => void;
}

export function createAppStore(): AppStore {
  const state = createInitialState();
  let version = 0;
  const listeners = new Set<() => void>();

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
      version++;
      listeners.forEach((l) => l());
    },
  };
}
