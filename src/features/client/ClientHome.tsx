"use client";

import Link from "next/link";
import { Can } from "@/components/auth/SessionProvider";
import { ClientIdCard } from "@/components/billing/ClientIdCard";
import { PaybillDetails } from "@/components/billing/PaybillDetails";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate, group, kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import {
  balance,
  clientById,
  collectionDays,
  lastPickup,
  nextPickup,
  truckForClient,
  txFor,
} from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

export function ClientHome() {
  const s = useAppState();
  const actions = useActions();

  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const bal = balance(s, client.id);
  const last = lastPickup(s, client.id);
  const truck = truckForClient(s, client);
  const recent = txFor(s, client.id).slice(-5).reverse();

  return (
    <>
      <PageHead title={`Karibu, ${client.name.split(" ")[0]}`}>
        Your collection account with {company.name}.
      </PageHead>

      <div className="grid g-main">
        <div className="stack" style={{ gap: 18 }}>
          <ClientIdCard client={client} />

          <Panel>
            <div className="grid g2">
              <div>
                <div className="label">
                  {bal > 0 ? "Amount due" : bal < 0 ? "In credit" : "Balance"}
                </div>
                <div className="bal" style={{ color: bal > 0 ? "var(--bad)" : "var(--ok)" }}>
                  {kes(Math.abs(bal))}
                </div>
                <div className="hint">
                  {client.type} plan · {kes(client.plan)} per month
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <Can permission="account.pay">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => actions.openStk(client.id)}
                    >
                      Pay with M-Pesa
                    </button>
                  </Can>
                  <Can permission="account.statement">
                    <Link className="btn" href="/client/statement" prefetch={false}>
                      View statement
                    </Link>
                  </Can>
                </div>
              </div>
              <PaybillDetails
                client={client}
                company={company}
                amount={Math.max(bal, client.plan)}
              />
            </div>
          </Panel>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <Panel title="Collection">
            <div className="list">
              <div className="li">
                <div>
                  <div className="sub">Next pickup</div>
                  <div className="t">{nextPickup(s, client)}</div>
                </div>
                <Chip tone="neutral">{collectionDays(client)}</Chip>
              </div>
              <div className="li">
                <div>
                  <div className="sub">Last collected</div>
                  <div className="t">{last ? fmtDate(last.when) : "—"}</div>
                </div>
                <span className="mono hint">{last ? last.truck : ""}</span>
              </div>
              <div className="li">
                <div>
                  <div className="sub">Your truck</div>
                  <div className="t mono">{truck ? truck.id : "Unassigned"}</div>
                </div>
                {truck && (
                  <Link className="btn small" href="/client/track" prefetch={false}>
                    Track
                  </Link>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Recent activity">
            <div className="list">
              {recent.map((t) => (
                <div className="li" key={t.id + t.date}>
                  <div>
                    <div className="t">{t.desc}</div>
                    <div className="sub">
                      {fmtDate(t.date)}
                      {t.kind === "payment" ? ` · ${t.id}` : ""}
                    </div>
                  </div>
                  <span
                    className="num"
                    style={{
                      fontWeight: 700,
                      color: t.kind === "payment" ? "var(--ok)" : "var(--ink)",
                    }}
                  >
                    {t.kind === "payment" ? "−" : "+"}
                    {group(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
