"use client";

import { CircleCheck, CircleHelp, Link2, Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Empty } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes } from "@/lib/format";
import type { Client, SuspenseItem } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";

/** Payments whose account number matched no client, waiting to be assigned. */
export function SuspenseQueue({ items, clients }: { items: SuspenseItem[]; clients: Client[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          <CircleHelp size={17} strokeWidth={2.2} aria-hidden="true" />
          Suspense
        </h3>
        {items.length > 0 && <span className="count-pill">{items.length}</span>}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Payments whose account number didn’t match a client. Assign them by hand.
      </p>
      {items.length === 0 ? (
        <Empty icon={CircleCheck}>Nothing waiting.</Empty>
      ) : (
        <div className="list">
          {items.map((item) => (
            <SuspenseRow key={item.id} item={item} clients={clients} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuspenseRow({ item, clients }: { item: SuspenseItem; clients: Client[] }) {
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const [target, setTarget] = useState(clients[0]?.id ?? "");

  return (
    <div className="li" style={{ flexWrap: "wrap" }}>
      <div>
        <div className="t num">
          {kes(item.amount)} <span className="mono hint">{item.id}</span>
        </div>
        <div className="sub">
          Typed <span className="mono">{item.account}</span> · {item.payer} · {fmtDate(item.date)}
        </div>
        <div className="sub with-ico" style={{ color: "var(--warn)" }}>
          <TriangleAlert size={13} strokeWidth={2.2} aria-hidden="true" />
          {item.reason}
        </div>
      </div>
      {can("payments.reconcile") ? (
        <div className="row">
          <select
            aria-label="Assign to client"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              const res = await actions.assignSuspense(item.id, target);
              toast(res.ok ? (res.message ?? "Assigned") : res.error);
            }}
          >
            <Link2 size={14} strokeWidth={2.2} aria-hidden="true" />
            Assign
          </button>
        </div>
      ) : (
        <span className="hint with-ico">
          <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
          Needs reconcile permission
        </span>
      )}
    </div>
  );
}
