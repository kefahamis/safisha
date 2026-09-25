"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useAppState } from "@/store/StoreProvider";

/**
 * Registers the service worker (production only: in development it would
 * cache stale builds) and shows a bar while offline or while work is queued.
 */
export function OfflineSupport() {
  const s = useAppState();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  }, []);

  if (s.online && s.pending === 0) return null;
  return (
    <div className="offline-bar" role="status">
      {s.online ? (
        <RefreshCw size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
      ) : (
        <CloudOff size={14} strokeWidth={2.2} aria-hidden="true" />
      )}
      {s.online
        ? `Syncing ${s.pending} saved change${s.pending === 1 ? "" : "s"}…`
        : s.pending
          ? `Offline · ${s.pending} change${s.pending === 1 ? "" : "s"} will sync when you reconnect`
          : "Offline · showing the last saved data"}
    </div>
  );
}
