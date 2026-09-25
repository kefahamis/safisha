"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { roleHome } from "@/lib/navigation";
import type { Workspace } from "@/lib/auth/types";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  workspace: Workspace;
}

/** Sign-in. Demo accounts are listed so each dashboard can be opened quickly. */
export function LoginForm({
  accounts,
  demoPassword,
}: {
  accounts: DemoAccount[];
  demoPassword: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [email, setEmail] = useState(accounts[0]?.email ?? "");
  const [password, setPassword] = useState(demoPassword);
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
      const target = next?.startsWith("/") ? next : roleHome(data.workspace as Workspace);
      router.replace(target);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authpage">
      <div className="authcard">
        <div className="authbrand">
          <span className="mark" aria-hidden="true" />
          <div>
            <b>Safisha</b>
            <small>Waste Hub</small>
          </div>
        </div>

        <h1>Sign in</h1>
        <p className="hint" style={{ marginTop: 4 }}>
          Your dashboard depends on the role your account holds.
        </p>

        <form className="stack" style={{ marginTop: 20, gap: 14 }} onSubmit={submit}>
          <label className="f">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="f">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="err">{error}</div>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      <div className="authcard demo">
        <h2>Demo accounts</h2>
        <p className="hint" style={{ marginTop: 4 }}>
          Password for all of them: <span className="mono">{demoPassword}</span>
        </p>
        <div className="list" style={{ marginTop: 8 }}>
          {accounts.map((a) => (
            <button
              type="button"
              key={a.email}
              className="li demo-row"
              onClick={() => {
                setEmail(a.email);
                setPassword(demoPassword);
                setError("");
              }}
            >
              <div>
                <div className="t">{a.name}</div>
                <div className="sub mono">{a.email}</div>
              </div>
              <span className="chip neutral">{a.role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
