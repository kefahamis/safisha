"use client";

import { ArrowDownLeft, CreditCard, Landmark, Smartphone } from "lucide-react";
import { Can } from "@/components/auth/SessionProvider";
import { C2BSimulator } from "@/components/mpesa/C2BSimulator";
import { SuspenseQueue } from "@/components/mpesa/SuspenseQueue";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate, group } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { clientById, clientsOf, paymentsOf } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function CompanyPayments() {
  const s = useAppState();
  const co = companyById(s.companyId);

  const payments = paymentsOf(s, co.id);
  const clients = clientsOf(s, co.id);
  const suspense = s.suspense.filter((x) => x.company === co.id);

  return (
    <>
      <PageHead title="M-Pesa payments" icon={CreditCard}>
        Paybill <span className="mono">{co.paybill}</span>. STK Push and Paybill payments are
        matched to clients by account number.
      </PageHead>

      <div className="grid g-main">
        <Panel title="Received" icon={ArrowDownLeft}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Channel</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((t) => {
                  const c = clientById(s, t.client);
                  return (
                    <tr key={t.id + t.date}>
                      <td className="mono">{t.id}</td>
                      <td className="num">{fmtDate(t.date)}</td>
                      <td>
                        {c?.name}
                        <div className="hint mono">{c?.id}</div>
                      </td>
                      <td>
                        <Chip
                          tone="neutral"
                          icon={t.channel === "STK Push" ? Smartphone : Landmark}
                        >
                          {t.channel}
                        </Chip>
                      </td>
                      <td className="r">{group(t.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="stack" style={{ gap: 18 }}>
          {/* Only where the server will run it: the demo, or Daraja's sandbox. Never against production keys. */}
          {(s.integrations.demo ? s.integrations.mpesa[co.id]?.environment !== "production" : s.integrations.mpesa[co.id]?.environment === "sandbox") && (
            <Can permission="payments.simulate">
              {/* Remount on company switch so the prefilled account follows the selection. */}
              <C2BSimulator key={co.id} company={co} defaultAccount={clients[1]?.id ?? ""} />
            </Can>
          )}
          <SuspenseQueue items={suspense} clients={clients} />
        </div>
      </div>
    </>
  );
}
