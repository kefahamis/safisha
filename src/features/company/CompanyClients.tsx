"use client";

import { Can } from "@/components/auth/SessionProvider";
import { AddClientForm } from "@/components/clients/AddClientForm";
import { ClientSearch, ClientTable } from "@/components/clients/ClientTable";
import { PageHead, Panel } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import { clientsOf } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

export function CompanyClients() {
  const s = useAppState();
  const actions = useActions();
  const co = companyById(s.companyId);

  return (
    <>
      <PageHead title="Clients">
        Every client gets a unique number: company · estate · sequence · check digit. The check
        digit lets Paybill catch mistyped account numbers.
      </PageHead>

      <Can permission="clients.create">
        <AddClientForm company={co} />
      </Can>

      <Panel>
        <div className="row" style={{ marginBottom: 12 }}>
          <ClientSearch id="cl-q" />
          <select
            aria-label="Estate"
            value={s.estateFilter}
            onChange={(e) => actions.setEstateFilter(e.target.value)}
          >
            <option value="">All estates</option>
            {co.estates.map((code) => (
              <option key={code} value={code}>
                {estateName(code)}
              </option>
            ))}
          </select>
        </div>
        <ClientTable clients={clientsOf(s, co.id)} />
        <p className="hint">Select a row to open the client’s statement.</p>
      </Panel>
    </>
  );
}
