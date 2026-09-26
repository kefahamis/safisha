"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  KeyRound,
  Link2,
  LoaderCircle,
  PlugZap,
  Save,
  Send,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/ToastProvider";
import { integrationDef, type FieldDef, type IntegrationView } from "@/lib/integrations";

const STATUS: Record<IntegrationView["status"], { label: string; tone: string; icon: LucideIcon }> = {
  ok: { label: "Connected", tone: "ok", icon: CircleCheck },
  error: { label: "Check failed", tone: "bad", icon: CircleAlert },
  unconfigured: { label: "Not connected", tone: "neutral", icon: CircleDashed },
};

/**
 * One integration: its form (rendered from the catalogue), status, test button
 * and the callback addresses to hand to the provider. Secrets are write-only:
 * the field shows whether one is saved, and typing replaces it.
 */
export function IntegrationCard({
  view,
  icon: Icon,
  onChange,
  extra,
}: {
  view: IntegrationView;
  icon: LucideIcon;
  onChange: (view: IntegrationView) => void;
  extra?: React.ReactNode;
}) {
  const def = integrationDef(view.key)!;
  const toast = useToast();
  const [config, setConfig] = useState<Record<string, unknown>>(view.config);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "test" | "register" | "send">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    view.statusDetail ? { ok: view.status === "ok", text: view.statusDetail } : null,
  );

  const dirty =
    Object.values(secrets).some((v) => v.trim()) ||
    def.fields.some(
      (f) => f.type !== "secret" && JSON.stringify(config[f.name] ?? "") !== JSON.stringify(view.config[f.name] ?? ""),
    );

  const url = `/api/settings/${encodeURIComponent(view.scope)}/${view.key}`;

  const save = async () => {
    setBusy("save");
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, secrets }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "Could not save." });
        return;
      }
      setSecrets({});
      setConfig(body.integration.config);
      onChange(body.integration);
      setMessage(
        def.testable && body.changed.length
          ? { ok: true, text: "Saved. Run the connection test to switch it live." }
          : { ok: true, text: "Saved." },
      );
      toast(`${def.title} saved`);
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const res = await fetch(`${url}/test`, { method: "POST" });
      const body = await res.json();
      setMessage({ ok: Boolean(body.ok), text: body.detail ?? body.error ?? "Test failed." });
      if (body.integration) onChange(body.integration);
    } finally {
      setBusy("");
    }
  };

  const sendTest = async () => {
    setBusy("send");
    try {
      const res = await fetch(`${url}/send-test`, { method: "POST" });
      const body = await res.json();
      setMessage({ ok: Boolean(body.ok), text: body.detail ?? body.error ?? "The test message failed." });
    } finally {
      setBusy("");
    }
  };

  const register = async () => {
    setBusy("register");
    try {
      const res = await fetch(`${url}/register`, { method: "POST" });
      const body = await res.json();
      setMessage({ ok: Boolean(body.ok), text: body.detail ?? body.error ?? "Registration failed." });
    } finally {
      setBusy("");
    }
  };

  const status = STATUS[view.status];
  const visible = def.fields.filter((f) => !f.when || String(config[f.when.field] ?? "") === f.when.is);

  return (
    <section className="panel icard">
      <header className="icard-head">
        <span className={`itile ${view.status === "ok" ? "ok" : "accent"}`} aria-hidden="true">
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="icard-title">
          <h3>{def.title}</h3>
          <span className="hint">{def.provider}</span>
        </div>
        <span className={`chip ${status.tone}`}>
          <status.icon size={13} strokeWidth={2.4} aria-hidden="true" />
          {status.label}
        </span>
      </header>

      <p className="hint icard-summary">
        {def.summary}
        {def.docs && (
          <>
            {" "}
            <a href={def.docs} target="_blank" rel="noreferrer" className="with-ico">
              Get keys
              <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
            </a>
          </>
        )}
      </p>

      <form
        className="icard-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {visible.map((f) => (
          <Field
            key={f.name}
            field={f}
            value={config[f.name]}
            secret={view.secrets[f.name]}
            typed={secrets[f.name] ?? ""}
            onValue={(v) => setConfig((c) => ({ ...c, [f.name]: v }))}
            onSecret={(v) => setSecrets((s) => ({ ...s, [f.name]: v }))}
          />
        ))}

        <div className="icard-actions">
          <button className="btn primary small" disabled={!dirty || busy !== ""}>
            {busy === "save" ? (
              <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
            ) : (
              <Save size={14} strokeWidth={2.2} aria-hidden="true" />
            )}
            Save
          </button>
          {def.testable && (
            <button type="button" className="btn small" onClick={test} disabled={busy !== "" || dirty}>
              {busy === "test" ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <PlugZap size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              Test connection
            </button>
          )}
          {(view.key === "sms" || view.key === "email") && view.scope === "platform" && view.status === "ok" && (
            <button type="button" className="btn small" onClick={sendTest} disabled={busy !== "" || dirty}>
              {busy === "send" ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Send size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              {view.key === "sms" ? "Text me a test" : "Email me a test"}
            </button>
          )}
          {view.key === "mpesa" && view.status === "ok" && (
            <button type="button" className="btn small" onClick={register} disabled={busy !== ""}>
              {busy === "register" ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
              ) : (
                <Link2 size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
              Register Paybill URLs
            </button>
          )}
          {dirty && def.testable && <span className="hint">Save before testing.</span>}
        </div>
      </form>

      {message && (
        <p className={`result ${message.ok ? "ok" : "bad"}`}>
          {message.ok ? (
            <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <CircleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
          )}
          {message.text}
        </p>
      )}

      {view.callbacks && view.callbacks.length > 0 && (
        <div className="icard-callbacks">
          <div className="label">Addresses for the provider</div>
          {view.callbacks.map((c) => (
            <div className="callback" key={c.label}>
              <div>
                <div className="hint">{c.label}</div>
                <code>{c.url}</code>
              </div>
              <CopyButton value={c.url} className="btn small ghost" label="Copy" />
            </div>
          ))}
        </div>
      )}

      {extra}

      {view.updatedBy && (
        <p className="hint icard-meta">
          Last changed by {view.updatedBy}
          {view.updatedAt ? ` · ${new Date(view.updatedAt).toLocaleString()}` : ""}
          {view.testedAt ? ` · tested ${new Date(view.testedAt).toLocaleString()}` : ""}
        </p>
      )}
    </section>
  );
}

function Field({
  field: f,
  value,
  secret,
  typed,
  onValue,
  onSecret,
}: {
  field: FieldDef;
  value: unknown;
  secret?: { saved: boolean; hint?: string };
  typed: string;
  onValue: (v: unknown) => void;
  onSecret: (v: string) => void;
}) {
  if (f.type === "toggle") {
    return (
      <label className="switch icard-toggle">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onValue(e.target.checked)} />
        {f.label}
      </label>
    );
  }

  return (
    <label className="f">
      <span>
        {f.label}
        {f.required && <span aria-hidden="true"> *</span>}
      </span>
      {f.type === "select" ? (
        <select value={String(value ?? "")} onChange={(e) => onValue(e.target.value)}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === "secret" ? (
        <span className="field">
          <KeyRound size={15} strokeWidth={2.2} aria-hidden="true" />
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            placeholder={secret?.saved ? `Saved (${secret.hint}) · type to replace` : "Not set"}
            onChange={(e) => onSecret(e.target.value)}
          />
        </span>
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "url" ? "url" : f.type === "email" ? "text" : "text"}
          value={value === null || value === undefined ? "" : String(value)}
          placeholder={f.placeholder}
          onChange={(e) => onValue(e.target.value)}
          spellCheck={false}
        />
      )}
      {f.help && <span className="hint">{f.help}</span>}
    </label>
  );
}
