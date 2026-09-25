"use client";

import { Empty } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/Chip";
import { fmtDate } from "@/lib/format";
import { clientById } from "@/lib/selectors";
import type { Ticket } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

export function TicketList({
  tickets,
  /** The company inbox shows who wrote in; the client inbox shows the topic. */
  secondary = "category",
}: {
  tickets: Ticket[];
  secondary?: "category" | "client";
}) {
  const s = useAppState();
  const actions = useActions();

  if (!tickets.length) return <Empty>No conversations yet.</Empty>;

  return (
    <div className="tickets">
      {tickets.map((t) => (
        <button
          type="button"
          className="tk"
          key={t.id}
          aria-current={s.selTicket === t.id}
          onClick={() => actions.selectTicket(t.id)}
        >
          <div className="row between">
            <b>{t.subject}</b>
            <StatusChip status={t.status} />
          </div>
          <div className="hint">
            {t.id} · {secondary === "client" ? clientById(s, t.client)?.name : t.cat} ·{" "}
            {fmtDate(t.msgs[t.msgs.length - 1].at)}
          </div>
        </button>
      ))}
    </div>
  );
}
