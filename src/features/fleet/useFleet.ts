"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import type { CommandResult } from "@/lib/commands";
import type { FleetBundle } from "@/lib/fleet";

/**
 * The fleet bundle for a company (or one truck), fetched on demand like the
 * books are: it's too much history for the live snapshot. `run` sends a change,
 * reports the outcome and refetches.
 */
export function useFleet(company: string, truck?: string) {
  const toast = useToast();
  const [data, setData] = useState<FleetBundle | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!company) return;
    const qs = truck ? `?truck=${encodeURIComponent(truck)}` : "";
    try {
      const res = await fetch(`/api/fleet/${company}${qs}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load the fleet.");
        return;
      }
      setError("");
      setData(body as FleetBundle);
    } catch {
      setError("You're offline. Fleet records will load when you're back online.");
    }
  }, [company, truck]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (pending: Promise<CommandResult>, done?: () => void) => {
      const res = await pending;
      toast(res.ok ? (res.message ?? "Saved") : res.error);
      if (res.ok) {
        done?.();
        void load();
      }
      return res;
    },
    [load, toast],
  );

  return { data, error, load, run };
}
