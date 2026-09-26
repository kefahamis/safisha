"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { CircleAlert, Fingerprint, KeyRound, LoaderCircle, Mail, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { methodLabel, type MfaMethod } from "@/lib/security";
import { AuthCard, DemoCode, Field, Submit } from "./AuthFlows";

interface Challenge {
  name: string;
  methods: { method: MfaMethod; detail: string }[];
  recovery: boolean;
  rememberDays: number;
}

const METHOD_ICON: Record<MfaMethod, typeof Mail> = { passkey: Fingerprint, totp: KeyRound, sms: Phone, email: Mail };

async function post(body: unknown) {
  const res = await fetch("/api/auth/mfa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

/** After the password: the second step, with whichever methods this person set up. */
export function TwoStepSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [failed, setFailed] = useState("");
  const [method, setMethod] = useState<MfaMethod | "recovery" | null>(null);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [sent, setSent] = useState<{ sentTo: string; demoCode?: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/mfa", { cache: "no-store" }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setFailed(body.error ?? "Your sign-in timed out.");
      setChallenge(body);
      // Passkeys first: one tap, nothing to type.
      const order: MfaMethod[] = ["passkey", "totp", "sms", "email"];
      setMethod(order.find((m) => body.methods.some((x: { method: string }) => x.method === m)) ?? "recovery");
    });
  }, []);

  const finish = (body: { recoveryLeft?: number }) => {
    const next = params.get("next");
    if (body.recoveryLeft !== undefined && body.recoveryLeft <= 2) {
      window.alert(
        `You have ${body.recoveryLeft} recovery code${body.recoveryLeft === 1 ? "" : "s"} left. Make new ones on your Security page.`,
      );
    }
    router.replace(next?.startsWith("/") ? next : "/start");
    router.refresh();
  };

  const pick = (m: MfaMethod | "recovery") => {
    setMethod(m);
    setCode("");
    setSent(null);
    setError("");
  };

  const send = async () => {
    setBusy(true);
    setError("");
    const { ok, body } = await post({ action: "send", method });
    setBusy(false);
    if (!ok) return setError(body.error ?? "Couldn't send the code.");
    setSent(body);
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post({ action: "verify", method, code, remember });
    setBusy(false);
    if (!ok) return setError(body.error ?? "That didn't work.");
    finish(body);
  };

  const passkey = async () => {
    setBusy(true);
    setError("");
    try {
      const options = await post({ action: "passkey.options" });
      if (!options.ok) throw new Error(options.body.error ?? "Couldn't start the passkey.");
      const response = await startAuthentication({ optionsJSON: options.body });
      const { ok, body } = await post({ action: "verify", method: "passkey", response, remember });
      if (!ok) throw new Error(body.error ?? "That passkey didn't work.");
      finish(body);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? "Cancelled. Try again, or use another method." : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <AuthCard title="Sign in again" lead={failed}>
        <Link href="/login" className="signin-submit" style={{ textDecoration: "none", justifyContent: "center" }}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }
  if (!challenge) {
    return (
      <AuthCard title="One more step" lead="Loading…">
        <span />
      </AuthCard>
    );
  }

  const detail = challenge.methods.find((m) => m.method === method)?.detail;
  const others = challenge.methods.filter((m) => m.method !== method);

  return (
    <AuthCard title="One more step" lead={`Hi ${challenge.name}. Confirm it's you.`}>
      {method === "passkey" && (
        <div className="signin-form">
          <p className="signin-desc" style={{ margin: 0 }}>
            Use your fingerprint, face or screen lock.
          </p>
          <button type="button" className="signin-submit" onClick={passkey} disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />
            ) : (
              <Fingerprint size={17} strokeWidth={2.2} aria-hidden="true" />
            )}
            Use passkey
          </button>
        </div>
      )}

      {(method === "sms" || method === "email") && !sent && (
        <div className="signin-form">
          <p className="signin-desc" style={{ margin: 0 }}>
            We&rsquo;ll send a 6-digit code to {detail}.
          </p>
          <button type="button" className="signin-submit" onClick={send} disabled={busy}>
            {busy && <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />}
            Send code
          </button>
        </div>
      )}

      {(method === "totp" || method === "recovery" || ((method === "sms" || method === "email") && sent)) && (
        <form className="signin-form" onSubmit={verify}>
          {sent && <DemoCode code={sent.demoCode} />}
          <Field
            icon={method === "recovery" ? KeyRound : ShieldCheck}
            label={
              method === "totp"
                ? "Code from your authenticator app"
                : method === "recovery"
                  ? "One of your recovery codes"
                  : `Code sent to ${sent?.sentTo}`
            }
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={method === "recovery" ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
          />
          <Submit busy={busy}>Verify</Submit>
        </form>
      )}

      {challenge.rememberDays > 0 && (
        <label className="twostep-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Don&rsquo;t ask again on this device for {challenge.rememberDays} day{challenge.rememberDays === 1 ? "" : "s"}
        </label>
      )}

      {error && (
        <p className="err twostep-error" role="alert">
          <CircleAlert size={15} strokeWidth={2.2} aria-hidden="true" />
          {error}
        </p>
      )}

      {(others.length > 0 || (challenge.recovery && method !== "recovery")) && (
        <div className="twostep-alt">
          <span className="hint">Or use</span>
          {others.map((m) => {
            const Icon = METHOD_ICON[m.method];
            return (
              <button key={m.method} type="button" className="btn small ghost" onClick={() => pick(m.method)}>
                <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
                {methodLabel(m.method)}
              </button>
            );
          })}
          {challenge.recovery && method !== "recovery" && (
            <button type="button" className="btn small ghost" onClick={() => pick("recovery")}>
              <KeyRound size={14} strokeWidth={2.2} aria-hidden="true" />
              Recovery code
            </button>
          )}
        </div>
      )}
    </AuthCard>
  );
}
