"use client";

import { Headset, MapPinned, MessageSquareText, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PlatformIdentity } from "@/components/layout/PlatformBrand";
import { ROLE_ICONS } from "@/components/ui/icons";
import { SignInPage, type Highlight } from "@/components/ui/SignInPage";
import type { Workspace } from "@/lib/auth/types";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  workspace: Workspace;
}

/** What the product actually does, for the hero's floating cards. */
const HIGHLIGHTS: Highlight[] = [
  {
    icon: Smartphone,
    title: "M-Pesa billing",
    text: "STK Push and Paybill payments land on the right account automatically.",
  },
  {
    icon: MapPinned,
    title: "Live fleet",
    text: "Clients see their collector coming; offices see every truck on route.",
  },
  {
    icon: Headset,
    title: "Customer care",
    text: "Requests go straight to the company that serves the estate.",
  },
];

/** Sign-in. In demo mode the demo accounts are listed so each dashboard can be opened quickly. */
export function LoginForm({
  accounts,
  demoPassword,
}: {
  accounts: DemoAccount[];
  /** Only in demo mode; a real deployment lists no accounts. */
  demoPassword?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [email, setEmail] = useState(accounts[0]?.email ?? "");
  const [password, setPassword] = useState(demoPassword ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      // A `next` from the gate only counts if it stays inside the app.
      // A second step first, when the account has one; it carries `next` on.
      const safeNext = next?.startsWith("/") ? next : undefined;
      const target = data.mfa ? `/login/verify${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}` : (safeNext ?? "/start");
      router.replace(target);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignInPage
      brand={
        <div className="authbrand">
          <PlatformIdentity markSize={42} />
        </div>
      }
      title={
        <>
          <span className="light">Welcome</span> back
        </>
      }
      description="Sign in to your dashboard. What you see depends on the role your account holds."
      email={email}
      password={password}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={submit}
      busy={busy}
      error={error}
      dividerLabel="Or try a demo account"
      formFooter={
        <>
          <Link href="/login/forgot" prefetch={false}>
            Forgot password?
          </Link>
          <Link href="/login/code" prefetch={false} className="with-ico">
            <MessageSquareText size={14} strokeWidth={2.2} aria-hidden="true" />
            Sign in with an SMS code
          </Link>
        </>
      }
      heroTitle="Nairobi’s waste collection, in one place."
      heroText="Clients, collectors and companies on the same live picture: every bin, every truck, every shilling."
      highlights={HIGHLIGHTS}
    >
      {demoPassword && accounts.length > 0 && (
        <>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            Pick one to fill the form. The password for all of them is{" "}
            <span className="mono">{demoPassword}</span>.
          </p>
          <div className="demo-grid">
            {accounts.map((a) => {
              const Icon = ROLE_ICONS[a.workspace];
              return (
                <button
                  type="button"
                  key={a.email}
                  className="demo-row"
                  aria-pressed={email === a.email}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(demoPassword ?? "");
                    setError("");
                  }}
                >
                  <span className={`avatar sm ws-${a.workspace}`} aria-hidden="true">
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <span className="demo-text">
                    <span className="t">{a.name}</span>
                    <span className="sub">{a.role}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </SignInPage>
  );
}
