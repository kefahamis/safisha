"use client";

import { ArrowLeft, ArrowRight, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, Mail, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PlatformIdentity } from "@/components/layout/PlatformBrand";

/** The centred card the account flows share. */
export function AuthCard({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <div className="authflow">
      <div className="authflow-card">
        <div className="authbrand">
          <PlatformIdentity markSize={40} />
        </div>
        <h1 className="signin-title" style={{ fontSize: "2rem" }}>
          {title}
        </h1>
        <p className="signin-desc" style={{ margin: "8px 0 20px" }}>
          {lead}
        </p>
        {children}
        <Link href="/login" className="signin-back with-ico" prefetch={false}>
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export function Field({
  icon: Icon,
  label,
  ...input
}: { icon: typeof Mail; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="signin-label">
      {label}
      <span className="glass-field">
        <Icon size={17} strokeWidth={2} aria-hidden="true" />
        <input {...input} />
      </span>
    </label>
  );
}

export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="signin-submit" disabled={busy}>
      {busy && <LoaderCircle size={17} strokeWidth={2.2} className="spin" aria-hidden="true" />}
      {children}
      {!busy && <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />}
    </button>
  );
}

/** Shown only when no SMS/email provider could deliver the code (never in production). */
export function DemoCode({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <div className="demo-code" role="status">
      <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>
        SMS and email aren’t connected yet, so here is the code: <b className="mono">{code}</b>
      </span>
    </div>
  );
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

/* ---------------- forgot password ---------------- */

export function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<"ask" | "reset">("ask");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [demoCode, setDemoCode] = useState<string>();
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post("/api/auth/forgot", { identifier });
    setBusy(false);
    if (!ok) return setError(body.error ?? "Something went wrong.");
    setInfo(body.message);
    setDemoCode(body.demoCode);
    setStep("reset");
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post("/api/auth/reset", { identifier, code, password });
    setBusy(false);
    if (!ok) return setError(body.error ?? "That didn't work.");
    router.replace(body.mfa ? "/login/verify" : "/start");
    router.refresh();
  };

  return (
    <AuthCard
      title="Reset your password"
      lead={step === "ask" ? "Enter the email or phone number on your account. We'll send a code." : info}
    >
      {step === "ask" ? (
        <form className="signin-form" onSubmit={ask}>
          <Field
            icon={Mail}
            label="Email or phone number"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or 0712 345 678"
            autoComplete="username"
            required
          />
          {error && <Err text={error} />}
          <Submit busy={busy}>Send code</Submit>
        </form>
      ) : (
        <form className="signin-form" onSubmit={reset}>
          <DemoCode code={demoCode} />
          <Field
            icon={KeyRound}
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <Field
            icon={LockKeyhole}
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error && <Err text={error} />}
          <Submit busy={busy}>Set password and sign in</Submit>
        </form>
      )}
    </AuthCard>
  );
}

/* ---------------- SMS code sign-in ---------------- */

export function PhoneSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post("/api/auth/otp/request", { phone });
    setBusy(false);
    if (!ok) return setError(body.error ?? "Something went wrong.");
    setDemoCode(body.demoCode);
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post("/api/auth/otp/verify", { phone, code });
    setBusy(false);
    if (!ok) return setError(body.error ?? "That code didn't work.");
    router.replace(body.mfa ? "/login/verify" : "/start");
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign in with a code"
      lead={
        step === "phone"
          ? "No password needed. We'll text a 6-digit code to the phone number on your account."
          : `If ${phone} is registered, a code is on its way. It expires in 15 minutes.`
      }
    >
      {step === "phone" ? (
        <form className="signin-form" onSubmit={ask}>
          <Field
            icon={Phone}
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="0712 345 678"
            autoComplete="tel"
            required
          />
          {error && <Err text={error} />}
          <Submit busy={busy}>Text me a code</Submit>
        </form>
      ) : (
        <form className="signin-form" onSubmit={verify}>
          <DemoCode code={demoCode} />
          <Field
            icon={KeyRound}
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          {error && <Err text={error} />}
          <Submit busy={busy}>Sign in</Submit>
        </form>
      )}
    </AuthCard>
  );
}

/* ---------------- accept an invitation ---------------- */

export function AcceptInvite({ email, token }: { email: string; token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, body } = await post("/api/auth/invite/accept", { email, token, password });
    setBusy(false);
    if (!ok) return setError(body.error ?? "That didn't work.");
    router.replace(body.mfa ? "/login/verify" : "/start");
    router.refresh();
  };

  return (
    <AuthCard title="Welcome aboard" lead={`Choose a password for ${email || "your account"} to finish setting up.`}>
      <form className="signin-form" onSubmit={accept}>
        <Field
          icon={LockKeyhole}
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        {error && <Err text={error} />}
        <Submit busy={busy}>Create account</Submit>
      </form>
    </AuthCard>
  );
}

function Err({ text }: { text: string }) {
  return (
    <div className="err" role="alert">
      <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
      {text}
    </div>
  );
}
