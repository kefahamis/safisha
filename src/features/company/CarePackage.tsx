"use client";

import { BadgeCheck, Check, CircleAlert, LoaderCircle, MessageSquareText, Package, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes, MONTHS } from "@/lib/format";
import { CARE_PACKAGES, PACKAGE_INFO, type CarePackage as Pkg, type PackageView } from "@/lib/packages";

/** "2026-10" -> "Oct 2026" */
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** The company's customer-care package: what each offers, and switching between them. */
export function CarePackage({ companyId }: { companyId: string }) {
  const toast = useToast();
  const [view, setView] = useState<PackageView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/company/${companyId}/package`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load your care package.");
    setView(body);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (next: Pkg) => {
    if (!view || next === view.package || busy) return;
    const ok =
      next === "premium"
        ? window.confirm(`Upgrade to Premium for ${kes(view.fee)} a month? This month is charged now.`)
        : window.confirm("Go back to Basic? Clients stop getting SMS and email from you. This month stays paid.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/company/${companyId}/package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      setView(body);
      toast(next === "premium" ? "You're on Premium." : "You're on Basic.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
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

  return (
    <>
      <PageHead title="Care package" icon={Package}>
        How your care desk reaches clients. Every company gets the app chat with the AI assistant; Premium adds SMS and
        email both ways.
      </PageHead>

      {view.package === "basic" && view.skippedThisMonth > 0 && (
        <div className="banner">
          <CircleAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          {view.skippedThisMonth} SMS to your clients {view.skippedThisMonth === 1 ? "wasn't" : "weren't"} sent this month
          because you&rsquo;re on Basic. They&rsquo;re listed under Settings &rsaquo; Activity.
        </div>
      )}

      <div className="grid g2 pkg-grid">
        {CARE_PACKAGES.map((key) => {
          const info = PACKAGE_INFO[key];
          const current = view.package === key;
          return (
            <Panel key={key} className={`pkg-card${current ? " current" : ""}`}>
              <div className="row between">
                <h3 className="pkg-name">{info.name}</h3>
                {current && (
                  <Chip tone="ok" icon={BadgeCheck}>
                    Your package
                  </Chip>
                )}
              </div>
              <div className="pkg-price">
                {key === "basic" ? (
                  <b>Included</b>
                ) : (
                  <>
                    <b className="num">{kes(view.fee)}</b> <span className="hint">a month</span>
                  </>
                )}
              </div>
              <p className="hint">{info.tagline}</p>
              <ul className="pkg-features">
                {info.features.map((f) => (
                  <li key={f}>
                    <Check size={15} strokeWidth={2.4} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              {current ? (
                key === "premium" && view.premiumSince ? (
                  <p className="hint">On Premium since {fmtDate(view.premiumSince)}.</p>
                ) : null
              ) : (
                <button
                  type="button"
                  className={`btn ${key === "premium" ? "primary" : "ghost"}`}
                  onClick={() => choose(key)}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" />
                  ) : (
                    key === "premium" && <MessageSquareText size={15} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {key === "premium" ? `Upgrade to Premium` : "Switch to Basic"}
                </button>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel title="Premium charges" icon={Receipt}>
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
            No charges yet. Premium is billed at the start of each month, and for the current month when you upgrade.
          </p>
        )}
        <p className="hint">Charges are owed to the platform and show in your books under Payable to platform.</p>
      </Panel>
    </>
  );
}
