"use client";

import { FileText } from "lucide-react";
import { PeriodSelect, StatementTable } from "@/components/billing/StatementTable";
import { BalanceChip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { useT } from "@/lib/i18n";
import { companyById } from "@/lib/reference/companies";
import { balance, clientById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function ClientStatement() {
  const s = useAppState();
  const { t } = useT();
  const client = clientById(s, s.clientId);
  if (!client) return null;

  return (
    <>
      <PageHead
        title={t("Statement")}
        icon={FileText}
        actions={
          <div className="row">
            <PeriodSelect />
            <BalanceChip balance={balance(s, client.id)} />
          </div>
        }
      >
        {client.name} · <span className="mono">{client.id}</span> ·{" "}
        {companyById(client.company).name}
      </PageHead>
      <Panel>
        <StatementTable clientId={client.id} />
      </Panel>
    </>
  );
}
