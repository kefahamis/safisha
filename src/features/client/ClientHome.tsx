"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Camera,
  ClipboardList,
  FileText,
  History,
  Leaf,
  MapPinned,
  Recycle,
  Smartphone,
  TriangleAlert,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Can } from "@/components/auth/SessionProvider";
import { ClientIdCard } from "@/components/billing/ClientIdCard";
import { PaybillDetails } from "@/components/billing/PaybillDetails";
import { Chip } from "@/components/ui/Chip";
import { IconTile, PageHead, Panel } from "@/components/ui/Panel";
import { fmtKg, impactTotals } from "@/lib/analytics";
import { fmtDate, group, kes } from "@/lib/format";
import { useT } from "@/lib/i18n";
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
  const { t } = useT();

  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const bal = balance(s, client.id);
  const last = lastPickup(s, client.id);
  const impact = impactTotals(s, new Set([client.id]), 30);
  const truck = truckForClient(s, client);
  const recent = txFor(s, client.id).slice(-5).reverse();

  return (
    <>
      <PageHead title={t("Karibu, {name}", { name: client.name.split(" ")[0] })} icon={Wallet}>
        {t("Your collection account with {company}.", { company: company.name })}
      </PageHead>

      <div className="grid g-main">
        <div className="stack" style={{ gap: 18 }}>
          <ClientIdCard client={client} />

          <Panel>
            <div className="grid g2">
              <div>
                <div className="label">
                  {t(bal > 0 ? "Amount due" : bal < 0 ? "In credit" : "Balance")}
                </div>
                <div className="bal" style={{ color: bal > 0 ? "var(--bad)" : "var(--ok)" }}>
                  {kes(Math.abs(bal))}
                </div>
                <div className="hint">
                  {t("{type} plan · {amount} per month", {
                    type: t(client.type),
                    amount: kes(client.plan),
                  })}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <Can permission="account.pay">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => actions.openStk(client.id)}
                    >
                      <Smartphone size={16} strokeWidth={2.2} aria-hidden="true" />
                      {t("Pay with M-Pesa")}
                    </button>
                  </Can>
                  <Can permission="account.statement">
                    <Link className="btn" href="/client/statement" prefetch={false}>
                      <FileText size={16} strokeWidth={2.2} aria-hidden="true" />
                      {t("View statement")}
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
          <Panel title={t("Collection")} icon={Recycle}>
            <div className="list">
              <div className="li">
                <div className="li-main">
                  <IconTile icon={CalendarClock} size="sm" />
                  <div>
                    <div className="sub">{t("Next pickup")}</div>
                    <div className="t">{t(nextPickup(s, client))}</div>
                  </div>
                </div>
                <Chip tone="neutral">{collectionDays(client)}</Chip>
              </div>
              <div className="li">
                <div className="li-main">
                  <IconTile icon={History} tone="ok" size="sm" />
                  <div>
                    <div className="sub">{t("Last collected")}</div>
                    <div className="t">{last ? fmtDate(last.when) : "—"}</div>
                    {last?.weightKg !== undefined && (
                      <div className="sub">
                        {last.weightKg} kg · {t(last.stream ?? "mixed")}
                      </div>
                    )}
                  </div>
                </div>
                {last?.photo ? (
                  <a
                    className="btn small ghost"
                    href={`/api/files/${last.photo}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Camera size={14} strokeWidth={2.2} aria-hidden="true" />
                    {t("Proof")}
                  </a>
                ) : (
                  <span className="mono hint">{last ? last.truck : ""}</span>
                )}
              </div>
              <div className="li">
                <div className="li-main">
                  <IconTile icon={Truck} tone="sky" size="sm" />
                  <div>
                    <div className="sub">{t("Your truck")}</div>
                    <div className="t mono">{truck ? truck.id : t("Unassigned")}</div>
                  </div>
                </div>
                {truck && (
                  <Link className="btn small" href="/client/track" prefetch={false}>
                    <MapPinned size={14} strokeWidth={2.2} aria-hidden="true" />
                    {t("Track")}
                  </Link>
                )}
              </div>
            </div>
          </Panel>

          <Panel title={t("Your recycling")} icon={Leaf}>
            <div className="impact">
              <div>
                <div className="impact-figure">{fmtKg(impact.total)}</div>
                <div className="hint">{t("collected in the last 30 days")}</div>
              </div>
              <div>
                <div className="impact-figure">{impact.rate}%</div>
                <div className="hint">{t("kept out of the dump site")}</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Can permission="pickups.request">
                <Link className="btn small" href="/client/pickups" prefetch={false}>
                  <ClipboardList size={14} strokeWidth={2.2} aria-hidden="true" />
                  {t("Book a pickup")}
                </Link>
              </Can>
              <Can permission="dumping.report">
                <Link className="btn small ghost" href="/client/report" prefetch={false}>
                  <TriangleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
                  {t("Report dumping")}
                </Link>
              </Can>
            </div>
          </Panel>

          <Panel title={t("Recent activity")} icon={History}>
            <div className="list">
              {recent.map((x) => (
                <div className="li" key={x.id + x.date}>
                  <div className="li-main">
                    <IconTile
                      icon={x.kind === "payment" ? ArrowDownLeft : ArrowUpRight}
                      tone={x.kind === "payment" ? "ok" : "neutral"}
                      size="sm"
                    />
                    <div>
                      <div className="t">{x.desc}</div>
                      <div className="sub">
                        {fmtDate(x.date)}
                        {x.kind === "payment" ? ` · ${x.id}` : ""}
                      </div>
                    </div>
                  </div>
                  <span className={`num amount${x.kind === "payment" ? " in" : ""}`}>
                    {x.kind === "payment" ? "−" : "+"}
                    {group(x.amount)}
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
