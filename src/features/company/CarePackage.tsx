"use client";

import { BadgeCheck, Check, CircleAlert, LoaderCircle, Minus, Package, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes, MONTHS } from "@/lib/format";
import { ALWAYS_INCLUDED, PACKAGE_FEATURES, type CarePackageDef, type PackageView } from "@/lib/packages";

/** "2026-10" -> "Oct 2026" */
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** The company's customer-care package: what's on offer, subscribing, switching and cancelling. */
export function CarePackage({ companyId }: { companyId: string }) {
  const toast = useToast();
  const [view, setView] = useState<PackageView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/company/${companyId}/package`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load your care package.");
    setView(body);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (pkg: CarePackageDef | null) => {
    if (!view || busy) return;
    const current = view.current;
    const question = !pkg
      ? `Cancel ${current?.name}? Clients stop getting SMS and email, and the Tickets desk closes. This month stays paid.`
      : current
        ? `Switch to ${pkg.name} for ${kes(pkg.price)} a month?${pkg.price > current.price ? " The difference for this month is charged now." : " This month stays as charged."}`
        : `Subscribe to ${pkg.name} for ${kes(pkg.price)} a month? This month is charged now.`;
    if (!window.confirm(question)) return;
    setBusy(pkg?.id ?? "none");
    try {
      const res = await fetch(`/api/company/${companyId}/package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: pkg?.id ?? null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      setView(body);
      toast(pkg ? `You're on ${pkg.name}.` : "Subscription cancelled.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!view) {
    return (
      <>
        <PageHead title="Care package" icon={Package} />
        {error ? <div className="banner">{error}</div> : <Empty icon={Package}>Loading…</Empty>}
      </>
    );
  }

  const current = view.current;
  // The current package stays listed even if the platform has stopped offering it.
  const cards = current && !view.offered.some((p) => p.id === current.id) ? [current, ...view.offered] : view.offered;

  return (
    <>
      <PageHead title="Care package" icon={Package}>
        Every company has the in-app care chat with the AI assistant. A package adds the Tickets desk and reaching clients by
        SMS and email, for a monthly fee.
      </PageHead>

      {view.skippedThisMonth > 0 && (
        <div className="banner">
          <CircleAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          {view.skippedThisMonth} SMS to your clients {view.skippedThisMonth === 1 ? "wasn't" : "weren't"} sent this month
          because your package doesn&rsquo;t include SMS. They&rsquo;re listed under Settings &rsaquo; Activity.
        </div>
      )}

      <Panel className="pkg-free">
        <div className="row between">
          <b>Included for everyone</b>
          {!current && (
            <Chip tone="ok" icon={BadgeCheck}>
              What you have now
            </Chip>
          )}
        </div>
        <ul className="pkg-features inline">
          {ALWAYS_INCLUDED.map((f) => (
            <li key={f}>
              <Check size={15} strokeWidth={2.4} aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      </Panel>

      {cards.length === 0 ? (
        <Empty icon={Package}>No packages are on offer yet. The platform will publish them here.</Empty>
      ) : (
        <div className="pkg-grid">
          {cards.map((p) => {
            const mine = current?.id === p.id;
            const price = mine ? current.price : p.price;
            return (
              <Panel key={p.id} className={`pkg-card${mine ? " current" : ""}`}>
                <div className="row between">
                  <h3 className="pkg-name">{p.name}</h3>
                  {mine && (
                    <Chip tone="ok" icon={BadgeCheck}>
                      Your package
                    </Chip>
                  )}
                </div>
                <div className="pkg-price">
                  <b className="num">{price ? kes(price) : "Free"}</b> {price > 0 && <span className="hint">a month</span>}
                  {mine && current.customPrice && <span className="hint"> · your agreed price</span>}
                </div>
                {p.description && <p className="hint">{p.description}</p>}
                <ul className="pkg-features">
                  {PACKAGE_FEATURES.map((f) => {
                    const has = p.features.includes(f.key);
                    return (
                      <li key={f.key} className={has ? "" : "no"} title={f.detail}>
                        {has ? (
                          <Check size={15} strokeWidth={2.4} aria-hidden="true" />
                        ) : (
                          <Minus size={15} strokeWidth={2.4} aria-hidden="true" />
                        )}
                        {f.label}
                      </li>
                    );
                  })}
                </ul>
                {mine ? (
                  <>
                    {view.since && <p className="hint">Subscribed since {fmtDate(view.since)}.</p>}
                    <button type="button" className="btn ghost" onClick={() => choose(null)} disabled={!!busy}>
                      {busy === "none" && <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" />}
                      Cancel subscription
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn primary" onClick={() => choose(p)} disabled={!!busy}>
                    {busy === p.id && <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" />}
                    {current ? `Switch to ${p.name}` : "Subscribe"}
                  </button>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="Package charges" icon={Receipt}>
        {view.charges.length ? (
          <div className="list">
            {view.charges.map((c) => (
              <div className="li" key={c.month}>
                <div className="t">{monthLabel(c.month)}</div>
                <b className="num">{kes(c.amount)}</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            No charges yet. A package is billed at the start of each month, and for the current month when you subscribe.
          </p>
        )}
        <p className="hint">Charges are owed to the platform and show in your books under Payable to platform.</p>
      </Panel>
    </>
  );
}
