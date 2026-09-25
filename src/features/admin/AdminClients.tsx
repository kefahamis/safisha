"use client";

import { UsersRound } from "lucide-react";
import { ClientSearch, ClientTable } from "@/components/clients/ClientTable";
import { PageHead, Panel } from "@/components/ui/Panel";
import { useAppState } from "@/store/StoreProvider";

export function AdminClients() {
  const s = useAppState();

  return (
    <>
      <PageHead title="Client database" icon={UsersRound}>
        Every registered client across all companies.
      </PageHead>
      <Panel>
        <div className="row" style={{ marginBottom: 12 }}>
          <ClientSearch id="ad-q" />
        </div>
        <ClientTable clients={s.clients} showCompany />
      </Panel>
    </>
  );
}
