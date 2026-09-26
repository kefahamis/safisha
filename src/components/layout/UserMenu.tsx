"use client";

import { ChevronDown, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { initials } from "@/lib/format";
import { useT, type Lang } from "@/lib/i18n";
import { useActions } from "@/store/StoreProvider";

/** How long the card lingers after the pointer leaves, so it can be reached. */
const CLOSE_DELAY = 160;

/** Who you are signed in as, and the way out — tucked behind the avatar. */
export function UserMenu() {
  const { session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const { lang, setLang, t } = useT();
  const actions = useActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cardId = useId();

  // Tap outside or Escape closes it — hover alone does nothing on touch screens.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!session) return null;

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const changeLang = async (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    await actions.setLang(next);
    router.refresh();
  };

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div
      ref={rootRef}
      className="usermenu"
      data-open={open || undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="usermenu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={cardId}
        aria-label={session.name}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(session.name)}
        </span>
        <ChevronDown size={15} strokeWidth={2.4} className="usermenu-caret" aria-hidden="true" />
      </button>

      <div id={cardId} className="usermenu-card" hidden={!open}>
        <div className="usermenu-head">
          <span className="avatar lg" aria-hidden="true">
            {initials(session.name)}
          </span>
          <div className="who">
            <b>{session.name}</b>
            <small>{session.email}</small>
            <span className="usermenu-role">
              {session.roleName}
              {session.department ? ` · ${session.department.name}` : ""}
            </span>
          </div>
        </div>

        <div className="usermenu-row">
          <span>{t("Language")}</span>
          <div className="segmented lang-toggle" role="radiogroup" aria-label={t("Language")}>
            {(["en", "sw"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                onClick={() => void changeLang(l)}
                title={l === "en" ? "English" : "Kiswahili"}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <Link href={`/${session.ws}/security`} className="usermenu-link" onClick={() => setOpen(false)}>
          <ShieldCheck size={17} strokeWidth={2.2} aria-hidden="true" />
          {t("Security")}
        </Link>

        <button type="button" className="usermenu-signout" onClick={signOut} disabled={busy}>
          {busy ? (
            <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />
          ) : (
            <LogOut size={17} strokeWidth={2.2} aria-hidden="true" />
          )}
          {busy ? "Signing out…" : t("Sign out")}
        </button>
      </div>
    </div>
  );
}
