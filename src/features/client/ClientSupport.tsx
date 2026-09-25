"use client";

import { NewTicketForm } from "@/components/support/NewTicketForm";
import { TicketList } from "@/components/support/TicketList";
import { TicketThread } from "@/components/support/TicketThread";
import { CopyButton } from "@/components/ui/CopyButton";
import { Empty, PageHead } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { clientById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function ClientSupport() {
  const s = useAppState();
  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const list = s.tickets
    .filter((t) => t.client === client.id)
    .sort((a, b) => b.msgs[b.msgs.length - 1].at.localeCompare(a.msgs[a.msgs.length - 1].at));

  // Fall back to the newest conversation when the selection belongs to another client.
  const selected = list.find((t) => t.id === s.selTicket) ?? list[0];

  return (
    <>
      <PageHead
        title="Customer care"
        actions={
          <div className="row">
            <span className="hint">Call</span>
            <span className="mono" style={{ fontWeight: 600, userSelect: "all" }}>
              {company.care}
            </span>
            <CopyButton value={company.care} />
            <span className="hint">{company.hours}</span>
          </div>
        }
      >
        Messages go straight to {company.name}’s care desk.
      </PageHead>

      <div className="support">
        <div className="stack">
          <NewTicketForm client={client} open={list.length === 0} />
          <TicketList tickets={list} secondary="category" />
        </div>
        <div>
          {selected ? (
            <TicketThread ticket={selected} me="client" />
          ) : (
            <Empty>Start a request and the care desk will reply here.</Empty>
          )}
        </div>
      </div>
    </>
  );
}
