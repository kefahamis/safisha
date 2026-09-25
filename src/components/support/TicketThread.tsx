"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { StatusChip } from "@/components/ui/Chip";
import { fmtDate } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { clientById } from "@/lib/selectors";
import type { Ticket, TicketStatus } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

const STATUSES: TicketStatus[] = ["Open", "Pending", "Resolved"];

/** One conversation. `me` decides which bubbles sit on the right. */
export function TicketThread({ ticket, me }: { ticket: Ticket; me: "client" | "agent" }) {
  const s = useAppState();
  const actions = useActions();
  const { can } = useSession();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const client = clientById(s, ticket.client);
  const company = companyById(ticket.company);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.id, ticket.msgs.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    actions.reply(ticket.id, me, draft);
    setDraft("");
  };

  return (
    <div className="panel">
      <div className="row between">
        <div>
          <h3>{ticket.subject}</h3>
          <div className="hint">
            {ticket.id} · {ticket.cat} · {client?.name} ({ticket.client})
          </div>
        </div>
        {me === "agent" && can("tickets.status") ? (
          <select
            aria-label="Ticket status"
            value={ticket.status}
            onChange={(e) => actions.setTicketStatus(ticket.id, e.target.value as TicketStatus)}
          >
            {STATUSES.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </select>
        ) : (
          <StatusChip status={ticket.status} />
        )}
      </div>

      <div className="thread" style={{ marginTop: 12 }} ref={scroller}>
        {ticket.msgs.map((m, i) =>
          m.from === "sys" ? (
            <div className="msg sys" key={i}>
              {m.text}
            </div>
          ) : (
            <div className={`msg ${m.from === me ? "me" : "them"}`} key={i}>
              {m.text}
              <div className="meta">
                {m.from === "agent" ? `${company.name} care` : client?.name} · {fmtDate(m.at)}
              </div>
            </div>
          ),
        )}
      </div>

      {can("tickets.reply") ? (
        <form className="reply" onSubmit={send}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={me === "agent" ? "Reply to client…" : "Write a message…"}
            autoComplete="off"
            aria-label="Message"
          />
          <button className="btn primary">Send</button>
        </form>
      ) : (
        <p className="hint" style={{ marginBottom: 0 }}>
          You can read this conversation but not reply.
        </p>
      )}
    </div>
  );
}
