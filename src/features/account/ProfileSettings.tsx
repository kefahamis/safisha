"use client";

import {
  BadgeCheck,
  Bell,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  Headset,
  KeyRound,
  LoaderCircle,
  MonitorSmartphone,
  Save,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { useTabStrip } from "@/components/ui/useTabStrip";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { passwordStrength, type ProfileView } from "@/lib/profile";
import { CareDeskSettings, ClientNotifications, PhotoPicker, Preferences, SignIns, VerifyButton, YourData } from "./ProfileSections";
import { send } from "./send";

type Tab = "details" | "password" | "preferences" | "notifications" | "desk" | "signins" | "data";


const digits = (p: string) => p.replace(/\D/g, "").replace(/^254/, "0");

/** Each person's own account: details, password, preferences, sign-ins and their data. */
export function ProfileSettings() {
  const { t } = useT();
  const [view, setView] = useState<ProfileView | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("details");
  const tabStrip = useTabStrip<HTMLDivElement>(tab);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/profile", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load your profile.");
    setView(body);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!view) {
    return (
      <>
        <PageHead title="Profile" icon={UserRound} />
        {error ? <div className="banner">{error}</div> : <Empty icon={UserRound}>Loading…</Empty>}
      </>
    );
  }

  const tabs: { id: Tab; label: string; icon: LucideIcon; show: boolean }[] = [
    { id: "details", label: t("Your details"), icon: UserRound, show: true },
    { id: "password", label: t("Password"), icon: KeyRound, show: true },
    { id: "preferences", label: t("Preferences"), icon: SlidersHorizontal, show: true },
    { id: "notifications", label: t("Notifications"), icon: Bell, show: Boolean(view.client) },
    { id: "desk", label: "Care desk", icon: Headset, show: Boolean(view.agent) },
    { id: "signins", label: t("Sign-ins"), icon: MonitorSmartphone, show: true },
    { id: "data", label: t("Your data"), icon: Database, show: true },
  ];

  return (
    <>
      <PageHead title={t("Profile")} icon={UserRound}>
        {t("Your details, password, preferences, where you're signed in, and a copy of your data.")}
      </PageHead>
      <div className="tabs" role="tablist" aria-label={t("Profile")} ref={tabStrip}>
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className="tab" onClick={() => setTab(x.id)}>
              <x.icon size={15} strokeWidth={2.2} aria-hidden="true" />
              {x.label}
            </button>
          ))}
      </div>
      <div className="profile-tab">
        {tab === "details" && <DetailsForm view={view} onSaved={setView} />}
        {tab === "password" && <PasswordForm />}
        {tab === "preferences" && <Preferences view={view} onSaved={setView} />}
        {tab === "notifications" && view.client && <ClientNotifications view={view} onSaved={setView} />}
        {tab === "desk" && view.agent && <CareDeskSettings view={view} onSaved={setView} />}
        {tab === "signins" && <SignIns />}
        {tab === "data" && <YourData view={view} />}
      </div>
    </>
  );
}

function DetailsForm({ view, onSaved }: { view: ProfileView; onSaved: (v: ProfileView) => void }) {
  const toast = useToast();
  const router = useRouter();
  const { session } = useSession();
  const [name, setName] = useState(view.name);
  const [email, setEmail] = useState(view.email);
  const [phone, setPhone] = useState(view.phone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailChanged = email.trim().toLowerCase() !== view.email.toLowerCase();
  const phoneChanged = digits(phone) !== digits(view.phone);
  const dirty = name.trim() !== view.name || emailChanged || phoneChanged;
  const needsPassword = emailChanged || phoneChanged;

  const reset = () => {
    setName(view.name);
    setEmail(view.email);
    setPhone(view.phone);
    setCurrentPassword("");
    setError("");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const out = await send("/api/account/profile", "PATCH", {
        name,
        email,
        phone,
        ...(needsPassword ? { currentPassword } : {}),
      });
      onSaved(out.view);
      setName(out.view.name);
      setEmail(out.view.email);
      setPhone(out.view.phone);
      setCurrentPassword("");
      toast("Profile saved.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Your details" icon={UserRound}>
      <div className="profile-who">
        <PhotoPicker name={name || view.name} photo={view.photo} onSaved={onSaved} />
        <div>
          <b>{view.name}</b>
          <div className="hint">
            {session?.roleName}
            {session?.department ? ` · ${session.department.name}` : ""}
            {` · member since ${fmtDate(view.createdAt)}`}
          </div>
        </div>
      </div>

      <form className="stack profile-form" onSubmit={save}>
        <label className="f">
          Full name
          <input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="f">
          <span className="row" style={{ gap: 8 }}>
            Email
            {view.emailVerified && !emailChanged && (
              <Chip tone="ok" icon={BadgeCheck}>
                Verified
              </Chip>
            )}
          </span>
          <input
            type="email"
            required
            maxLength={120}
            autoComplete="email"
            value={email}
            disabled={view.emailCodesOn}
            onChange={(e) => setEmail(e.target.value)}
          />
          {view.emailCodesOn && <LockedHint what="email codes" />}
        </label>
        {!view.emailVerified && !emailChanged && (
          <VerifyButton channel="email" onVerified={() => onSaved({ ...view, emailVerified: true })} />
        )}

        <label className="f">
          <span className="row" style={{ gap: 8 }}>
            Mobile number
            {view.phoneVerified && !phoneChanged && view.phone && (
              <Chip tone="ok" icon={BadgeCheck}>
                Verified
              </Chip>
            )}
          </span>
          <span className="hint">For SMS sign-in codes and password resets.</span>
          <input
            type="tel"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            disabled={view.smsCodesOn}
            onChange={(e) => setPhone(e.target.value)}
          />
          {view.smsCodesOn && <LockedHint what="SMS codes" />}
        </label>
        {view.phone && !view.phoneVerified && !phoneChanged && (
          <VerifyButton channel="phone" onVerified={() => onSaved({ ...view, phoneVerified: true })} />
        )}

        {needsPassword && (
          <label className="f">
            Current password <span className="hint">(needed to change your email or phone)</span>
            <PasswordInput value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required />
          </label>
        )}

        <FormError error={error} />

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn primary" disabled={busy || !dirty || (needsPassword && !currentPassword)}>
            {busy ? <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" /> : <Save size={15} strokeWidth={2.2} aria-hidden="true" />}
            Save changes
          </button>
          {dirty && (
            <button type="button" className="btn ghost" onClick={reset} disabled={busy}>
              Discard
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current && next.length >= 8 && next === confirm;

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const out = await send("/api/account/password", "POST", { currentPassword: current, newPassword: next, signOutOthers });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(out.signedOut ? `Password changed. ${out.signedOut} other device${out.signedOut === 1 ? " was" : "s were"} signed out.` : "Password changed.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Change password" icon={KeyRound}>
      <form className="stack profile-form" onSubmit={change}>
        <label className="f">
          Current password
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" required />
        </label>

        <label className="f">
          New password
          <PasswordInput value={next} onChange={setNext} autoComplete="new-password" required minLength={8} />
          <span className="pw-meter" data-score={strength.score} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="hint" aria-live="polite">
            {strength.label ? `${strength.label}. ` : ""}At least 8 characters. A longer phrase is stronger than symbols.
          </span>
        </label>

        <label className="f">
          Confirm new password
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" required invalid={mismatch} />
          {mismatch && <span className="err">The passwords don&rsquo;t match.</span>}
        </label>

        <FormError error={error} />

        <button type="submit" className="btn primary" disabled={busy || !ready} style={{ justifySelf: "start" }}>
          {busy ? <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" /> : <KeyRound size={15} strokeWidth={2.2} aria-hidden="true" />}
          Change password
        </button>
        <label className="check-row">
          <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
          Sign out my other devices
        </label>
        <p className="hint">You stay signed in here.</p>
      </form>
    </Panel>
  );
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-field">
      <input
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={200}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
      >
        {shown ? <EyeOff size={17} strokeWidth={2} aria-hidden="true" /> : <Eye size={17} strokeWidth={2} aria-hidden="true" />}
      </button>
    </span>
  );
}

function LockedHint({ what }: { what: string }) {
  const { session } = useSession();
  return (
    <span className="hint">
      Your {what} for two-step sign-in go here. Turn them off on your{" "}
      <Link href={`/${session?.ws ?? "client"}/security`}>Security page</Link> to change it.
    </span>
  );
}

function FormError({ error }: { error: string }) {
  return error ? (
    <p className="err" role="alert">
      <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
      {error}
    </p>
  ) : null;
}
