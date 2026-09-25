"use client";

import { useSession } from "@/components/auth/SessionProvider";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/ToastProvider";
import { estateName } from "@/lib/reference/estates";
import { balance } from "@/lib/selectors";
import type { Truck } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

/** Today's stop list for one truck, in route order. */
export function RouteSheet({ truck }: { truck: Truck }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const mayComplete = can("route.complete");

  const estates = [...new Set(truck.route)];
  const stops = estates.flatMap((e) =>
    s.clients.filter((c) => c.company === truck.company && c.estate === e),
  );
  const sheet = s.stops[truck.id] ?? {};
  const done = stops.filter((c) => sheet[c.id]).length;

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h3>
          {done} of {stops.length} stops done
        </h3>
        <span className="hint">{estates.map(estateName).join(" → ")}</span>
      </div>

      {stops.map((c, i) => {
        const status = sheet[c.id];
        const rowClass =
          status === "Collected" ? "stop done" : status === "Skipped" ? "stop skipped" : "stop";
        return (
          <div className={rowClass} key={c.id}>
            <span className="n">
              {status === "Collected" ? "✓" : status === "Skipped" ? "!" : i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 650 }}>{c.name}</div>
              <div className="hint">
                <span className="mono">{c.id}</span> · {estateName(c.estate)} · {c.type}
                {balance(s, c.id) > c.plan && (
                  <span style={{ color: "var(--bad)", fontWeight: 600 }}> · 2+ months unpaid</span>
                )}
              </div>
            </div>
            <div className="row">
              {!mayComplete ? (
                status ? (
                  <Chip tone={status === "Collected" ? "ok" : "warn"}>{status}</Chip>
                ) : (
                  <span className="hint">View only</span>
                )
              ) : status ? (
                <>
                  <Chip tone={status === "Collected" ? "ok" : "warn"}>{status}</Chip>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => actions.undoStop(truck.id, c.id)}
                  >
                    Undo
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => actions.markStop(truck.id, c.id, "Collected")}
                  >
                    Collected
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      actions.markStop(truck.id, c.id, "Skipped");
                      toast("Client notified via customer care");
                    }}
                  >
                    No access
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
