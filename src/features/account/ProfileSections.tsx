"use client";

import {
  Bell,
  Camera,
  CircleAlert,
  Database,
  Download,
  Headset,
  LoaderCircle,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Moon,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Chip } from "@/components/ui/Chip";
import { Empty, Panel } from "@/components/ui/Panel";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/ToastProvider";
import { initials } from "@/lib/format";
import { useT, type Lang } from "@/lib/i18n";
import { CLIENT_NOTICES, type ClientNotice, type ProfileView, type SignInRow, type Theme } from "@/lib/profile";
import { uploadPhoto } from "@/store/actions";
import { send } from "./send";

type Saved = (v: ProfileView) => void;

const savePrefs = async (body: Record<string, unknown>) => (await send("/api/account/preferences", "PATCH", body)).view as ProfileView;

/** Puts the chosen appearance on the page straight away; "system" hands it back to the device. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

function Spinner({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" /> : null;
}

/* ---------------- photo ---------------- */

export function PhotoPicker({ name, photo, onSaved }: { name: string; photo?: string; onSaved: Saved }) {
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (file: File | null) => {
    setBusy(true);
    try {
      const id = file ? await uploadPhoto(file) : null;
      onSaved(await savePrefs({ photo: id }));
      toast(file ? "Photo updated." : "Photo removed.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="photo-pick">
      <button type="button" className="avatar lg photo-pick-face" onClick={() => input.current?.click()} disabled={busy} aria-label="Change your photo">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${photo}`} alt="" />
        ) : (
          initials(name)
        )}
        <span className="photo-pick-badge" aria-hidden="true">
          {busy ? <LoaderCircle size={12} strokeWidth={2.4} className="spin" /> : <Camera size={12} strokeWidth={2.4} />}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void save(f);
        }}
      />
      {photo && (
        <button type="button" className="link-btn" onClick={() => save(null)} disabled={busy}>
          Remove
        </button>
      )}
    </div>
  );
}

/* ---------------- verifying email and phone ---------------- */

export function VerifyButton({ channel, onVerified }: { channel: "email" | "phone"; onVerified: () => void }) {
  const toast = useToast();
  const [sent, setSent] = useState<{ sentTo: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      setSent(await send("/api/account/verify", "POST", { action: `${channel}.start` }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await send("/api/account/verify", "POST", { action: `${channel}.confirm`, code });
      toast(channel === "email" ? "Email verified." : "Mobile number verified.");
      onVerified();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="verify-box">
      {!sent ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="hint with-ico">
            <CircleAlert size={13} strokeWidth={2.2} aria-hidden="true" />
            {channel === "email" ? "Your email isn't verified yet." : "Your number isn't verified yet."}
          </span>
          <button type="button" className="btn small" onClick={start} disabled={busy}>
            <Spinner busy={busy} />
            Send a code
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <span className="hint">
            We sent a 6-digit code to {sent.sentTo}.{sent.demoCode ? ` Demo code: ${sent.demoCode}` : ""}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Verification code"
              style={{ width: 130 }}
            />
            <button type="button" className="btn small primary" onClick={confirm} disabled={busy || code.replace(/\s/g, "").length !== 6}>
              <Spinner busy={busy} />
              Verify
            </button>
            <button type="button" className="btn small ghost" onClick={start} disabled={busy}>
              Resend
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- preferences ---------------- */

const THEMES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "system", label: "Match my device", icon: Monitor },
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
];

export function Preferences({ view, onSaved }: { view: ProfileView; onSaved: Saved }) {
  const toast = useToast();
  const router = useRouter();
  const { t, setLang } = useT();
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      onSaved(await savePrefs(body));
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid g2 profile-grid">
      <Panel title={t("Preferences")} icon={SlidersHorizontal}>
        <div className="stack" style={{ gap: 18 }}>
          <div className="pref-row">
            <div>
              <b>{t("Language")}</b>
              <div className="hint">{t("Menus and messages in the app.")}</div>
            </div>
            <div className="segmented" role="radiogroup" aria-label={t("Language")}>
              {(["en", "sw"] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={view.lang === l}
                  disabled={busy !== null}
                  onClick={async () => {
                    if (l === view.lang) return;
                    setLang(l);
                    await save("lang", { lang: l }, l === "sw" ? "Lugha: Kiswahili." : "Language: English.");
                    router.refresh();
                  }}
                >
                  {l === "en" ? "English" : "Kiswahili"}
                </button>
              ))}
            </div>
          </div>

          <div className="pref-row">
            <div>
              <b>{t("Appearance")}</b>
              <div className="hint">{t("Light, dark, or whatever your device uses.")}</div>
            </div>
            <div className="segmented" role="radiogroup" aria-label={t("Appearance")}>
              {THEMES.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="radio"
                  aria-checked={view.theme === x.key}
                  title={x.label}
                  disabled={busy !== null}
                  onClick={() => {
                    if (x.key === view.theme) return;
                    applyTheme(x.key);
                    void save("theme", { theme: x.key }, `${x.label}.`);
                  }}
                >
                  <x.icon size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span className="sr-only-sm">{x.key === "system" ? t("Auto") : t(x.label)}</span>
                </button>
              ))}
            </div>
          </div>

          {view.startOptions && (
            <label className="f">
              Start page <span className="hint">(where you land after signing in)</span>
              <select
                value={view.startPage ?? ""}
                disabled={busy !== null}
                onChange={(e) => save("start", { startPage: e.target.value || null }, "Start page saved.")}
              >
                <option value="">The usual one</option>
                {view.startOptions.map((o) => (
                  <option key={o.href} value={o.href}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- clients: messages and M-Pesa ---------------- */

export function ClientNotifications({ view, onSaved }: { view: ProfileView; onSaved: Saved }) {
  const toast = useToast();
  const { t } = useT();
  const client = view.client!;
  const [busy, setBusy] = useState<string | null>(null);
  const [mpesa, setMpesa] = useState(client.mpesaPhone);

  const flip = async (key: ClientNotice, on: boolean) => {
    setBusy(key);
    try {
      onSaved(await savePrefs({ notify: { ...client.notify, [key]: on } }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveMpesa = async () => {
    setBusy("mpesa");
    try {
      const v = await savePrefs({ mpesaPhone: mpesa });
      onSaved(v);
      setMpesa(v.client?.mpesaPhone ?? "");
      toast(mpesa.trim() ? t("M-Pesa number saved.") : t("M-Pesa prompts will go to your contact number."));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid g2 profile-grid">
      <Panel title={t("Notifications")} icon={Bell}>
        <p className="hint" style={{ marginTop: -4 }}>
          {t("Messages from {company} outside the app. You'll always see everything in the app.", { company: client.company })}
        </p>
        <div className="list">
          {CLIENT_NOTICES.map((n) => (
            <div className="li" key={n.key}>
              <div>
                <div className="t">{t(n.label)}</div>
                <div className="sub">{t(n.detail)}</div>
              </div>
              <Toggle checked={client.notify[n.key]} busy={busy === n.key} label={t(n.label)} onChange={(on) => flip(n.key, on)} />
            </div>
          ))}
        </div>
        <p className="hint">{t("Sign-in codes are always sent. Some messages depend on your provider's package.")}</p>
      </Panel>
      <Panel title={t("M-Pesa number")} icon={Bell}>
        <form
          className="stack profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveMpesa();
          }}
        >
          <label className="f">
            {t("Number for payment prompts")}
            <input
              type="tel"
              inputMode="tel"
              maxLength={20}
              placeholder={client.contactPhone}
              value={mpesa}
              onChange={(e) => setMpesa(e.target.value)}
            />
            <span className="hint">{t("Leave blank to use your contact number, {phone}.", { phone: client.contactPhone })}</span>
          </label>
          <button type="submit" className="btn primary" style={{ justifySelf: "start" }} disabled={busy !== null || mpesa === client.mpesaPhone}>
            <Spinner busy={busy === "mpesa"} />
            <Save size={15} strokeWidth={2.2} aria-hidden="true" />
            {t("Save")}
          </button>
        </form>
      </Panel>
    </div>
  );
}

/* ---------------- care agents ---------------- */

export function CareDeskSettings({ view, onSaved }: { view: ProfileView; onSaved: Saved }) {
  const toast = useToast();
  const agent = view.agent!;
  const [signature, setSignature] = useState(agent.signature);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      onSaved(await savePrefs(body));
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid g2 profile-grid">
      <Panel title="Availability" icon={Headset}>
        <div className="pref-row">
          <div>
            <b>{agent.away ? "Away from the desk" : "At the desk"}</b>
            <div className="hint">
              While you&rsquo;re away you&rsquo;re listed last, marked &ldquo;away&rdquo;, when tickets are assigned.
            </div>
          </div>
          <Toggle
            checked={!agent.away}
            busy={busy === "away"}
            label="At the desk"
            onChange={(on) => save("away", { away: !on }, on ? "You're back at the desk." : "You're marked away.")}
          />
        </div>
      </Panel>
      <Panel title="Reply signature" icon={Headset}>
        <form
          className="stack profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save("signature", { signature }, signature.trim() ? "Signature saved." : "Signature removed.");
          }}
        >
          <label className="f">
            Added under every reply you send a client
            <textarea rows={3} maxLength={200} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={`${view.name.split(" ")[0]}, Customer care`} />
          </label>
          <button type="submit" className="btn primary" style={{ justifySelf: "start" }} disabled={busy !== null || signature === agent.signature}>
            <Spinner busy={busy === "signature"} />
            <Save size={15} strokeWidth={2.2} aria-hidden="true" />
            Save signature
          </button>
        </form>
      </Panel>
    </div>
  );
}

/* ---------------- sign-ins ---------------- */

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function SignIns() {
  const toast = useToast();
  const { t } = useT();
  const [rows, setRows] = useState<SignInRow[] | null>(null);
  const [tracked, setTracked] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/sessions", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setRows(body.sessions);
      setTracked(body.tracked);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const out = await send("/api/account/sessions", "POST", body);
      setRows(out.sessions);
      toast(out.signedOut ? `Signed out ${out.signedOut} device${out.signedOut === 1 ? "" : "s"}.` : "Nothing else was signed in.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!rows) return <Empty icon={MonitorSmartphone}>Loading…</Empty>;
  const others = rows.filter((r) => r.active && !r.current).length;

  return (
    <Panel
      title={t("Where you're signed in")}
      icon={MonitorSmartphone}
      aside={
        <button type="button" className="btn small" onClick={() => act("all", { action: "revokeOthers" })} disabled={busy !== null || others === 0}>
          <Spinner busy={busy === "all"} />
          <LogOut size={14} strokeWidth={2.2} aria-hidden="true" />
          {t("Sign out everywhere else")}
        </button>
      }
    >
      {!tracked && (
        <p className="hint" style={{ marginTop: -4 }}>
          {t("This sign-in started before devices were recorded, so it isn't listed. Sign in again to see it here.")}
        </p>
      )}
      {rows.length === 0 ? (
        <Empty icon={MonitorSmartphone}>{t("No sign-ins recorded in the last 90 days.")}</Empty>
      ) : (
        <div className="list">
          {rows.map((r) => (
            <div className="li" key={r.id}>
              <div>
                <div className="t row" style={{ gap: 8 }}>
                  {r.device}
                  {r.current ? (
                    <Chip tone="ok" icon={ShieldCheck}>
                      {t("This device")}
                    </Chip>
                  ) : !r.active ? (
                    <Chip tone="neutral">{t("Signed out")}</Chip>
                  ) : null}
                </div>
                <div className="sub">
                  {t("Signed in")} {new Date(r.createdAt).toLocaleString()} · {r.method}
                  {r.ip ? ` · ${r.ip === "::1" || r.ip === "127.0.0.1" ? "this computer" : r.ip}` : ""}
                  {r.active ? ` · ${t("last active")} ${ago(r.lastSeenAt)}` : ""}
                </div>
              </div>
              {r.active && !r.current && (
                <button type="button" className="btn small ghost" onClick={() => act(r.id, { action: "revoke", id: r.id })} disabled={busy !== null}>
                  <Spinner busy={busy === r.id} />
                  {t("Sign out")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="hint">{t("Don't recognise one? Sign it out and change your password.")}</p>
    </Panel>
  );
}

/* ---------------- your data ---------------- */

export function YourData({ view }: { view: ProfileView }) {
  const toast = useToast();
  const { t } = useT();
  const { session } = useSession();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTicket, setSentTicket] = useState<string | null>(null);
  const isClient = session?.ws === "client";

  const requestDeletion = async () => {
    if (!window.confirm(t("Ask {company} to close your account and delete your personal data?", { company: view.client?.company ?? "" }))) return;
    setBusy(true);
    try {
      const out = await send("/api/account/deletion", "POST", { reason });
      setSentTicket(out.ticket);
      toast(out.already ? t("You've already asked; it's request {id}.", { id: out.ticket }) : t("Request {id} sent.", { id: out.ticket }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid g2 profile-grid">
      <Panel title={t("Download your data")} icon={Database}>
        <p className="hint" style={{ marginTop: -4 }}>
          {isClient
            ? t("A copy of your account, statement, collections, pickup requests and conversations, as a JSON file.")
            : "A copy of your profile, sign-ins and the actions you've taken, as a JSON file."}
        </p>
        <a className="btn primary" href="/api/account/export" download>
          <Download size={15} strokeWidth={2.2} aria-hidden="true" />
          {t("Download")}
        </a>
      </Panel>
      <Panel title={t("Delete your account")} icon={UserX}>
        {isClient ? (
          <div className="stack" style={{ gap: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              {t(
                "{company} closes the account and removes your personal data once any balance is settled. Billing records are kept for five years, as the law requires.",
                { company: view.client?.company ?? "" },
              )}
            </p>
            {sentTicket ? (
              <div className="banner ok">{t("Request {id} sent. You'll get a reply in Customer care.", { id: sentTicket })}</div>
            ) : (
              <>
                <label className="f">
                  {t("Reason (optional)")}
                  <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <button type="button" className="btn ghost danger" style={{ justifySelf: "start" }} onClick={requestDeletion} disabled={busy}>
                  <Spinner busy={busy} />
                  <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                  {t("Request deletion")}
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            Staff accounts are closed by your company or platform admin. Ask them to remove yours when you leave.
          </p>
        )}
      </Panel>
    </div>
  );
}
