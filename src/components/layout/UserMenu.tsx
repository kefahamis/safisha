"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";

/** Who you are signed in as, and the way out. */
export function UserMenu() {
  const { session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const initials = session.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="usermenu">
      <span className="avatar" aria-hidden="true">
        {initials}
      </span>
      <div className="who">
        <b>{session.name}</b>
        <small>{session.roleName}</small>
      </div>
      <button type="button" className="btn small ghost" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
