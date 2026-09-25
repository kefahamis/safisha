"use client";

import { PeriodSelect, StatementTable } from "@/components/billing/StatementTable";
import { BalanceChip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate } from "@/lib/format";
import { estateName } from "@/lib/reference/estates";
import { balance, clientsOf } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

export function CompanyStatements() {
  const s = useAppState();
  const actions = useActions();

  const clients = clientsOf(s, s.companyId);
  // The stored selection may belong to another company after a context switch.
  const client = clients.find((c) => c.id === s.stmtClient) ?? clients[0];
  if (!client) return null;

  return (
    <>
      <PageHead title="Statements">
        Running account for any client, by month or all time.
      </PageHead>

      <Panel>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="row">
            <select
              aria-label="Client"
              value={client.id}
              onChange={(e) => actions.setStatementClient(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.id}
                </option>
              ))}
            </select>
            <PeriodSelect />
          </div>
          <BalanceChip balance={balance(s, client.id)} />
        </div>

        <div className="hint" style={{ marginBottom: 8 }}>
          {client.name} · {client.type} · {estateName(client.estate)} · {client.phone} · client
          since {fmtDate(client.joined)}
        </div>

        <StatementTable clientId={client.id} />
      </Panel>
    </>
  );
}
