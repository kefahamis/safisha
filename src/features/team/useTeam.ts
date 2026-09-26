"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import type { TeamBundle } from "@/lib/team";

/** The company's departments and staff, and a helper that writes and refetches. */
export function useTeam(company: string) {
  const toast = useToast();
  const [data, setData] = useState<TeamBundle | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/company/${company}/team`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load your team.");
    setError("");
    setData(body as TeamBundle);
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sends a change; on success reports it and reloads. Returns the body, or null on failure. */
  const send = useCallback(
    async (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, done: string) => {
      const res = await fetch(`/api/company/${company}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(out.error ?? "That didn't save.");
        return null;
      }
      toast(done);
      void load();
      return out as Record<string, unknown>;
    },
    [company, load, toast],
  );

  return { data, error, load, send };
}
