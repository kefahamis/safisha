"use client";

import { ArrowRight, Check, ChevronDown, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useT } from "@/lib/i18n";
import { allDone, doneCount, type OnboardingView } from "@/lib/onboarding";

const COLLAPSED_KEY = "zoa-getting-started-collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The last checklist this tab saw, per person. Drawn before the first paint so
 * the card doesn't drop in after its request and push the dashboard down; the
 * request then brings it up to date.
 */
const cacheKey = (who: string) => `zoa-getting-started:${who}`;

function readCache(who: string): OnboardingView | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(who));
    return raw ? (JSON.parse(raw) as OnboardingView) : null;
  } catch {
    return null;
  }
}

function writeCache(who: string, view: OnboardingView) {
  try {
    window.sessionStorage.setItem(cacheKey(who), JSON.stringify(view));
  } catch {
    // Blocked storage: the card just appears once its request returns.
  }
}

function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // Private windows and blocked storage: it just won't be remembered.
  }
}

/**
 * The getting-started checklist on someone's own dashboard. Quiet by design:
 * no pop-ups or tours, it folds to one line, "Hide" puts it away for good (the
 * Profile page can bring it back), and it disappears once every step is done.
 */
export function GettingStarted() {
  const { t } = useT();
  const toast = useToast();
  const { session } = useSession();
  const who = session?.sub ?? "";
  const listId = useId();
  const [view, setView] = useState<OnboardingView | null>(null);
  // Nothing renders until the steps load, so reading storage here can't mismatch the server's HTML.
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && readCollapsed());

  const load = useCallback(async () => {
    const res = await fetch("/api/account/onboarding", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const fresh = (await res.json()) as OnboardingView;
    setView(fresh);
    if (who) writeCache(who, fresh);
  }, [who]);

  // Before paint, so a returning visit shows the card in place rather than sliding the page.
  useLayoutEffect(() => {
    const cached = who ? readCache(who) : null;
    if (cached) setView(cached);
  }, [who]);

  useEffect(() => {
    void load();
    // Steps get done on other pages; catch up when the person comes back.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (!view || view.hidden || !view.steps.length || allDone(view)) return null;

  const done = doneCount(view);
  const total = view.steps.length;
  const next = view.steps.find((s) => !s.done);

  const toggle = () => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  };

  const hide = async () => {
    const hidden = { ...view, hidden: true };
    setView(hidden);
    if (who) writeCache(who, hidden);
    // Say where it went, so hiding it never feels like losing it.
    toast(t("Getting started is hidden. Bring it back from Profile › Preferences."));
    await fetch("/api/account/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden: true }),
    }).catch(() => null);
  };

  return (
    <section className={`onboard${collapsed ? " collapsed" : ""}`} aria-label={t("Getting started")}>
      <div className="onboard-head">
        <button type="button" className="onboard-toggle" onClick={toggle} aria-expanded={!collapsed} aria-controls={listId}>
          <Sparkles size={15} strokeWidth={2.2} aria-hidden="true" />
          <b>{t("Getting started")}</b>
          <span className="onboard-count">{t("{done} of {total} done", { done, total })}</span>
          <span className="onboard-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${done / total})` }} />
          </span>
          {collapsed && next && <span className="onboard-next">{t("Next: {step}", { step: t(next.label) })}</span>}
          <ChevronDown size={15} strokeWidth={2.2} className="onboard-caret" aria-hidden="true" />
        </button>
        <button type="button" className="onboard-hide" onClick={hide} aria-label={t("Hide getting started")} title={t("Hide")}>
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {/* Kept in the page when folded, so the toggle's aria-controls always points at it. */}
      <ol className="onboard-steps" id={listId} hidden={collapsed}>
          {view.steps.map((s) => (
            <li key={s.key} className={s.done ? "done" : ""}>
              <span className="onboard-mark" aria-hidden="true">
                {s.done && <Check size={12} strokeWidth={3} />}
              </span>
              <div className="onboard-text">
                <span className="onboard-label">{t(s.label)}</span>
                {!s.done && <span className="hint">{t(s.detail)}</span>}
              </div>
              {!s.done && (
                <Link href={s.href} className="onboard-go" aria-label={`${t("Go")}: ${t(s.label)}`}>
                  {t("Go")}
                  <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              )}
              <span className="sr-only">{s.done ? t("Done") : t("Not done yet")}</span>
            </li>
          ))}
      </ol>
    </section>
  );
}
