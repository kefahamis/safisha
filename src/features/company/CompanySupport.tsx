"use client";

import { Clock3, Headset, MessagesSquare, PhoneCall } from "lucide-react";
import { useEffect } from "react";
import { CareChat } from "@/components/support/CareChat";
import { TicketList } from "@/components/support/TicketList";
import { Empty, IconTile, PageHead } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { clientById } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

export function CompanySupport() {
  const s = useAppState();
  const actions = useActions();
  const co = companyById(s.companyId);

  // Unresolved first, then most recently active.
  const list = s.tickets
    .filter((t) => t.company === co.id)
    .sort(
      (a, b) =>
        Number(a.status === "Resolved") - Number(b.status === "Resolved") ||
        b.msgs[b.msgs.length - 1].at.localeCompare(a.msgs[a.msgs.length - 1].at),
    );

  const selected = list.find((t) => t.id === s.selTicket) ?? list[0];
  const client = selected ? clientById(s, selected.client) : undefined;

  // Pin the ticket on screen. Otherwise resolving it re-sorts the inbox and the
  // view would silently jump to whichever ticket is now first.
  useEffect(() => {
    if (selected && s.selTicket !== selected.id) actions.selectTicket(selected.id);
  }, [selected, s.selTicket, actions]);
  const open = list.filter((t) => t.status !== "Resolved").length;

  return (
    <>
      <PageHead
        title="Customer care"
        icon={Headset}
        actions={
          <div className="care-card">
            <IconTile icon={PhoneCall} tone="ok" />
            <div>
              <div className="hint">Hotline</div>
              <div className="mono" style={{ fontWeight: 650 }}>
                {co.care}
              </div>
            </div>
            <span className="hint with-ico">
              <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
              {co.hours}
            </span>
          </div>
        }
      >
        {co.name} inbox. Clients only see their own company’s desk.
      </PageHead>

      <div className="support">
        <div className="stack">
          <span className="label">
            Inbox · {open} open of {list.length}
          </span>
          <TicketList tickets={list} secondary="client" />
        </div>
        {selected && client ? (
          <CareChat me="agent" client={client} ticket={selected} />
        ) : (
          <Empty icon={MessagesSquare}>No tickets.</Empty>
        )}
      </div>
    </>
  );
}
