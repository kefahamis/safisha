"use client";

import { Clock3, Headset, PhoneCall, Plus } from "lucide-react";
import { useState } from "react";
import { CareChat } from "@/components/support/CareChat";
import { TicketList } from "@/components/support/TicketList";
import { CopyButton } from "@/components/ui/CopyButton";
import { IconTile, PageHead } from "@/components/ui/Panel";
import { useT } from "@/lib/i18n";
import { companyById } from "@/lib/reference/companies";
import { clientById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function ClientSupport() {
  const s = useAppState();
  const { t } = useT();
  const [composing, setComposing] = useState(false);

  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const list = s.tickets
    .filter((x) => x.client === client.id)
    .sort((a, b) => b.msgs[b.msgs.length - 1].at.localeCompare(a.msgs[a.msgs.length - 1].at));

  // Fall back to the newest conversation when the selection belongs to another client.
  const selected = composing ? undefined : (list.find((x) => x.id === s.selTicket) ?? list[0]);

  return (
    <>
      <PageHead
        title={t("Customer care")}
        icon={Headset}
        actions={
          <div className="care-card">
            <IconTile icon={PhoneCall} tone="ok" />
            <div>
              <div className="mono" style={{ fontWeight: 650, userSelect: "all" }}>
                {company.care}
              </div>
              <div className="hint with-ico">
                <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
                {company.hours}
              </div>
            </div>
            <CopyButton value={company.care} label={t("Copy")} />
          </div>
        }
      >
        {t("Messages go straight to {company}’s care desk.", { company: company.name })}
      </PageHead>

      <div className="support">
        <div className="stack">
          <div className="row between">
            <span className="label">{t("Your conversations · {n}", { n: list.length })}</span>
            <button type="button" className="btn small primary" onClick={() => setComposing(true)}>
              <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
              {t("New request")}
            </button>
          </div>
          <TicketList
            tickets={list}
            secondary="category"
            activeId={selected?.id ?? null}
            onSelect={() => setComposing(false)}
          />
        </div>
        <CareChat
          me="client"
          client={client}
          ticket={selected}
          onNew={() => setComposing(true)}
          onCreated={() => setComposing(false)}
        />
      </div>
    </>
  );
}
