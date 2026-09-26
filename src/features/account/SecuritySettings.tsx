"use client";

import { startRegistration } from "@simplewebauthn/browser";
import {
  BadgeCheck,
  CircleAlert,
  Copy,
  Download,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Mail,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Toggle } from "@/components/ui/Toggle";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate } from "@/lib/format";
import { MFA_METHODS, type FactorView, type MfaMethod, type SecurityView } from "@/lib/security";

const ICONS: Record<MfaMethod, LucideIcon> = {
  passkey: Fingerprint,
  totp: KeyRound,
  sms: Smartphone,
  email: Mail,
};

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/account/security", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "That didn't work.");
  return out;
}

/** Each person's own sign-in security: the second steps they've turned on. */
export function SecuritySettings() {
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<SecurityView | null>(null);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [open, setOpen] = useState<MfaMethod | null>(null);
  const [switching, setSwitching] = useState<MfaMethod | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/security", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load your security settings.");
    setView(body);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** After a method is turned on: show recovery codes once, and leave the setup hold. */
  const onEnabled = (out: { view: SecurityView; recoveryCodes?: string[]; unlocked?: boolean }, what: string) => {
    setView(out.view);
    setOpen(null);
    toast(`${what} is on.`);
    if (out.recoveryCodes) setCodes(out.recoveryCodes);
    if (out.unlocked) router.refresh();
  };

  /** One passkey among several. */
  const remove = async (f: FactorView) => {
    if (!window.confirm(`Remove the passkey "${f.label}"?`)) return;
    try {
      const out = await call({ action: "factor.remove", id: f.id });
      setView(out.view);
      toast(`${f.label} removed.`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  /** The switch: on opens setup; off removes the method (every passkey, for passkeys). */
  const flip = async (method: MfaMethod, label: string, mine: FactorView[], next: boolean) => {
    if (next) return setOpen(method);
    if (!mine.length) return setOpen(null); // backing out of a setup not yet finished
    const what = method === "passkey" && mine.length > 1 ? `all ${mine.length} passkeys` : label;
    if (!window.confirm(`Turn off ${what}? You won't be able to sign in with it.`)) return;
    setSwitching(method);
    try {
      let latest: SecurityView | undefined;
      for (const f of mine) latest = (await call({ action: "factor.remove", id: f.id })).view;
      if (latest) setView(latest);
      toast(`${label} is off.`);
    } catch (e) {
      toast((e as Error).message);
      void load();
    } finally {
      setSwitching(null);
    }
  };

  const regenerate = async () => {
    if (!window.confirm("Make new recovery codes? The old ones stop working.")) return;
    try {
      const out = await call({ action: "recovery.regenerate" });
      setView(out.view);
      setCodes(out.recoveryCodes);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const forget = async () => {
    await call({ action: "device.forget" }).catch(() => null);
    toast("This device will ask for your second step next time.");
  };

  if (!view) {
    return (
      <>
        <PageHead title="Security" icon={ShieldCheck} />
        {error ? <div className="banner">{error}</div> : <Empty icon={ShieldCheck}>Loading…</Empty>}
      </>
    );
  }

  const offered = MFA_METHODS.filter((m) => view.policy.methods.includes(m.key));
  const on = view.factors.length > 0;

  return (
    <>
      <PageHead title="Security" icon={ShieldCheck}>
        Two-step sign-in: after your password, a second check that only you can pass. What&rsquo;s offered is set by the
        platform for your kind of account.
      </PageHead>

      {view.setupRequired ? (
        <div className="banner bad">
          <ShieldAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          Your account needs two-step sign-in. Turn on one of the methods below to continue.
        </div>
      ) : view.policy.requirement === "off" ? (
        <div className="banner">
          <CircleAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          Two-step sign-in is turned off for your kind of account.
        </div>
      ) : (
        <div className={`banner ${on ? "ok" : ""}`}>
          {on ? <ShieldCheck size={17} strokeWidth={2.2} aria-hidden="true" /> : <CircleAlert size={17} strokeWidth={2.2} aria-hidden="true" />}
          {on
            ? `Two-step sign-in is on. ${view.policy.requirement === "required" ? "It's required for your account." : "Switch every method off to turn it off."}`
            : "Two-step sign-in is off. Turn on a method to protect your account if your password leaks."}
        </div>
      )}

      {view.policy.requirement !== "off" && (
        <div className="sec-methods">
          {offered.map((m) => {
            const mine = view.factors.filter((f) => f.method === m.key);
            const Icon = ICONS[m.key];
            const expanded = open === m.key;
            const active = mine.length > 0;
            return (
              <Panel key={m.key} className={`sec-method${active ? " on" : ""}${expanded && !active ? " pending" : ""}`}>
                <div className="sec-method-head">
                  <span className={`itile ${active ? "ok" : "neutral"}`} aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <div className="sec-method-text">
                    <div className="row" style={{ gap: 8 }}>
                      <b>{m.label}</b>
                      {m.key === "email" && view.emailVerified && (
                        <Chip tone="ok" icon={BadgeCheck}>
                          Verified
                        </Chip>
                      )}
                    </div>
                    <div className="hint">{m.detail}</div>
                  </div>
                  <Toggle
                    checked={active || expanded}
                    busy={switching === m.key}
                    label={`${m.label}: ${active ? "on" : "off"}`}
                    onChange={(next) => void flip(m.key, m.label, mine, next)}
                  />
                </div>

                {active && (
                  <div className="list sec-factors">
                    {mine.map((f) => (
                      <div className="li" key={f.id}>
                        <div>
                          <div className="t">{f.label}</div>
                          <div className="sub">
                            {f.detail ? `${f.detail} · ` : ""}added {fmtDate(f.createdAt)}
                            {f.lastUsedAt ? ` · last used ${fmtDate(f.lastUsedAt)}` : ""}
                          </div>
                        </div>
                        {m.key === "passkey" && mine.length > 1 && (
                          <button type="button" className="btn small ghost" onClick={() => remove(f)}>
                            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {m.key === "passkey" && !expanded && (
                      <button type="button" className="btn small ghost sec-add" onClick={() => setOpen("passkey")}>
                        <Fingerprint size={14} strokeWidth={2.2} aria-hidden="true" />
                        Add another passkey
                      </button>
                    )}
                  </div>
                )}

                {expanded && (
                  <div className="sec-setup">
                    {m.key === "passkey" && <PasskeySetup onDone={onEnabled} onCancel={() => setOpen(null)} />}
                    {m.key === "totp" && <TotpSetup onDone={onEnabled} onCancel={() => setOpen(null)} />}
                    {m.key === "sms" && <SmsSetup phone={view.phone} onDone={onEnabled} onCancel={() => setOpen(null)} />}
                    {m.key === "email" && <EmailSetup email={view.email} onDone={onEnabled} onCancel={() => setOpen(null)} />}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {on && (
        <div className="grid g2">
          <Panel title="Recovery codes" icon={KeyRound}>
            <p className="hint" style={{ marginTop: -4 }}>
              For when you can&rsquo;t use any method above: a lost phone, a new laptop. Each code works once.
            </p>
            <div className="row between">
              <span>
                <b className="num">{view.recoveryCodesLeft}</b> of 10 left
              </span>
              <button type="button" className="btn small" onClick={regenerate}>
                <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                New codes
              </button>
            </div>
          </Panel>
          <Panel title="This device" icon={MonitorSmartphone}>
            <p className="hint" style={{ marginTop: -4 }}>
              {view.policy.rememberDays
                ? `If you ticked "remember this device" at sign-in, it skips the second step for ${view.policy.rememberDays} days.`
                : "Devices aren't remembered for your account type; every sign-in asks for the second step."}
            </p>
            {view.policy.rememberDays > 0 && (
              <button type="button" className="btn small ghost" onClick={forget}>
                Forget this device
              </button>
            )}
          </Panel>
        </div>
      )}

      {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
    </>
  );
}

type Done = (out: { view: SecurityView; recoveryCodes?: string[]; unlocked?: boolean }, what: string) => void;

function useStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function StepError({ error }: { error: string }) {
  return error ? (
    <p className="err" role="alert">
      <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
      {error}
    </p>
  ) : null;
}

function Spinner({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" /> : null;
}

function PasskeySetup({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { busy, error, run } = useStep();
  const [label, setLabel] = useState("");
  const supported = typeof window !== "undefined" && "PublicKeyCredential" in window;

  const add = () =>
    run(async () => {
      const options = await call({ action: "passkey.options" });
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (e) {
        const name = (e as Error).name;
        throw new Error(name === "NotAllowedError" ? "Cancelled, or this device has no screen lock set up." : (e as Error).message);
      }
      const out = await call({ action: "passkey.register", response, label: label || guessDevice() });
      onDone(out, "Passkey");
    });

  if (!supported) return <p className="hint">This browser can&rsquo;t create passkeys. Try a recent Chrome, Safari or Edge.</p>;
  return (
    <div className="form">
      <label className="f">
        Name it <span className="hint">(optional)</span>
        <input maxLength={40} placeholder={guessDevice()} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" onClick={add} disabled={busy}>
          <Spinner busy={busy} />
          <Fingerprint size={16} strokeWidth={2.2} aria-hidden="true" />
          Create passkey
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <StepError error={error} />
    </div>
  );
}

function guessDevice() {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

function TotpSetup({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { busy, error, run } = useStep();
  const [setup, setSetup] = useState<{ secret: string; qr: string; uri: string } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    void run(async () => setSetup(await call({ action: "totp.start" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => onDone(await call({ action: "totp.confirm", code }), "Authenticator app"));
  };

  if (!setup) return <>{busy ? <p className="hint">Preparing…</p> : <StepError error={error} />}</>;
  return (
    <form className="totp-setup" onSubmit={confirm}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} />
      <div className="stack" style={{ gap: 10 }}>
        <ol className="hint sec-steps">
          <li>Open your authenticator app and add an account.</li>
          <li>Scan the code, or type this key:</li>
        </ol>
        <code className="sec-secret">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
        <label className="f">
          3. Enter the 6-digit code it shows
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn primary" disabled={busy || code.replace(/\s/g, "").length !== 6}>
            <Spinner busy={busy} />
            Turn on
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <StepError error={error} />
      </div>
    </form>
  );
}

function CodeStep({
  sent,
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  sent: { sentTo: string; demoCode?: string };
  onConfirm: (code: string) => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(code);
      }}
    >
      <label className="f">
        Code sent to {sent.sentTo}
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>
          <Spinner busy={busy} />
          Confirm
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {sent.demoCode && (
        <p className="hint" style={{ gridColumn: "1 / -1" }}>
          Demo: nothing can deliver it yet, so here it is: <b className="mono">{sent.demoCode}</b>
        </p>
      )}
      <StepError error={error} />
    </form>
  );
}

function SmsSetup({ phone: initial, onDone, onCancel }: { phone?: string; onDone: Done; onCancel: () => void }) {
  const { busy, error, run } = useStep();
  const [phone, setPhone] = useState(initial ?? "");
  const [sent, setSent] = useState<{ sentTo: string; demoCode?: string } | null>(null);

  if (sent) {
    return (
      <CodeStep
        sent={sent}
        busy={busy}
        error={error}
        onCancel={onCancel}
        onConfirm={(code) => void run(async () => onDone(await call({ action: "sms.confirm", phone, code }), "SMS code"))}
      />
    );
  }
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => setSent(await call({ action: "sms.start", phone })));
      }}
    >
      <label className="f">
        Phone number
        <input inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn primary" disabled={busy || !phone.trim()}>
          <Spinner busy={busy} />
          Send code
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <StepError error={error} />
    </form>
  );
}

function EmailSetup({ email, onDone, onCancel }: { email: string; onDone: Done; onCancel: () => void }) {
  const { busy, error, run } = useStep();
  const [sent, setSent] = useState<{ sentTo: string; demoCode?: string } | null>(null);

  if (sent) {
    return (
      <CodeStep
        sent={sent}
        busy={busy}
        error={error}
        onCancel={onCancel}
        onConfirm={(code) => void run(async () => onDone(await call({ action: "email.confirm", code }), "Email code"))}
      />
    );
  }
  return (
    <div className="form">
      <p className="hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
        We&rsquo;ll send a code to <b>{email}</b> to verify the address first.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run(async () => setSent(await call({ action: "email.start" })))}>
          <Spinner busy={busy} />
          Send code
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <StepError error={error} />
    </div>
  );
}

function RecoveryCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const text = codes.join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Recovery codes — each works once.\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="modal">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Recovery codes">
        <h2 className="with-ico" style={{ marginTop: 0 }}>
          <KeyRound size={19} strokeWidth={2.2} aria-hidden="true" />
          Save your recovery codes
        </h2>
        <p className="hint">
          If you lose your phone or passkey, one of these gets you in. Each works once. This is the only time they&rsquo;re shown.
        </p>
        <div className="sec-codes mono">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(text)}>
            <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
            Copy
          </button>
          <button type="button" className="btn small" onClick={download}>
            <Download size={14} strokeWidth={2.2} aria-hidden="true" />
            Download
          </button>
          <button type="button" className="btn small primary" onClick={onClose}>
            I&rsquo;ve saved them
          </button>
        </div>
      </div>
    </div>
  );
}
