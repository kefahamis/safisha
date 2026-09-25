"use client";

import { MessageCircle, MessagesSquare } from "lucide-react";
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
  activeId,
  onSelect,
}: {
  tickets: Ticket[];
  secondary?: "category" | "client";
  /** Overrides the highlighted row; `null` highlights none. Defaults to the store selection. */
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const s = useAppState();
  const actions = useActions();

  if (!tickets.length) return <Empty icon={MessagesSquare}>No conversations yet.</Empty>;

  return (
    <div className="tickets">
      {tickets.map((t) => (
        <button
          type="button"
          className="tk"
          key={t.id}
          aria-current={(activeId === undefined ? s.selTicket : activeId) === t.id}
          onClick={() => {
            actions.selectTicket(t.id);
            onSelect?.(t.id);
          }}
        >
          <div className="tk-head">
            <b>{t.subject}</b>
            <StatusChip status={t.status} />
          </div>
          <div className="hint with-ico">
            <MessageCircle size={13} strokeWidth={2.2} aria-hidden="true" />
            {t.msgs.length} · {t.id} ·{" "}
            {secondary === "client" ? clientById(s, t.client)?.name : t.cat} ·{" "}
            {fmtDate(t.msgs[t.msgs.length - 1].at)}
          </div>
        </button>
      ))}
    </div>
  );
}
