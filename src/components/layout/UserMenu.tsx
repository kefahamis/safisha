"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { initials } from "@/lib/format";
import { useT, type Lang } from "@/lib/i18n";
import { useActions } from "@/store/StoreProvider";

/** Who you are signed in as, and the way out. */
export function UserMenu() {
  const { session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { lang, setLang, t } = useT();
  const actions = useActions();

  if (!session) return null;

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
    <div className="usermenu">
      <span className="avatar" aria-hidden="true">
        {initials(session.name)}
      </span>
      <div className="who">
        <b>{session.name}</b>
        <small>{session.roleName}</small>
      </div>
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
      <button
        type="button"
        className="btn small ghost icon-only"
        onClick={signOut}
        disabled={busy}
        aria-label={busy ? "Signing out" : t("Sign out")}
        title={t("Sign out")}
      >
        {busy ? (
          <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />
        ) : (
          <LogOut size={17} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
