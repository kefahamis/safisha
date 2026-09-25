"use client";

import { CalendarCheck, FileText, House, MapPin, Phone, Store, UserRound } from "lucide-react";
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
      <PageHead title="Statements" icon={FileText}>
        Running account for any client, by month or all time.
      </PageHead>

      <Panel>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="row">
            <label className="select-ico">
              <UserRound size={15} strokeWidth={2.2} aria-hidden="true" />
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
            </label>
            <PeriodSelect />
          </div>
          <BalanceChip balance={balance(s, client.id)} />
        </div>

        <div className="meta-row">
          <span>
            {client.type === "Business" ? (
              <Store size={14} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <House size={14} strokeWidth={2.2} aria-hidden="true" />
            )}
            {client.name} · {client.type}
          </span>
          <span>
            <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
            {estateName(client.estate)}
          </span>
          <span className="mono">
            <Phone size={14} strokeWidth={2.2} aria-hidden="true" />
            {client.phone}
          </span>
          <span>
            <CalendarCheck size={14} strokeWidth={2.2} aria-hidden="true" />
            Client since {fmtDate(client.joined)}
          </span>
        </div>

        <StatementTable clientId={client.id} />
      </Panel>
    </>
  );
}
