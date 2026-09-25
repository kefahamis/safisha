"use client";

import { TicketList } from "@/components/support/TicketList";
import { TicketThread } from "@/components/support/TicketThread";
import { Empty, PageHead } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { useAppState } from "@/store/StoreProvider";

export function CompanySupport() {
  const s = useAppState();
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

  return (
    <>
      <PageHead
        title="Customer care"
        actions={
          <span className="hint">
            Hotline <span className="mono">{co.care}</span> · {co.hours}
          </span>
        }
      >
        {co.name} inbox. Clients only see their own company’s desk.
      </PageHead>

      <div className="support">
        <div>
          <TicketList tickets={list} secondary="client" />
        </div>
        <div>
          {selected ? <TicketThread ticket={selected} me="agent" /> : <Empty>No tickets.</Empty>}
        </div>
      </div>
    </>
  );
}
