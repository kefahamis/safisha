"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty, Panel } from "@/components/ui/Panel";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AUDIENCES,
  MFA_METHODS,
  REMEMBER_CHOICES,
  type Audience,
  type MfaMethod,
  type Requirement,
  type SecurityPolicy,
} from "@/lib/security";

const REQUIREMENTS: { key: Requirement; label: string; hint: string }[] = [
  { key: "off", label: "Off", hint: "Password (or phone code) only." },
  { key: "optional", label: "Optional", hint: "Each person decides." },
  { key: "required", label: "Required", hint: "Everyone sets one up at next sign-in." },
];

/**
 * The platform admin's control over two-step sign-in: for each kind of account,
 * whether it's off, optional or required, which methods may be used, and how
 * long a device can be remembered.
 */
export function SecurityPolicyPanel() {
  const toast = useToast();
  const [saved, setSaved] = useState<SecurityPolicy | null>(null);
  const [draft, setDraft] = useState<SecurityPolicy | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/security", { cache: "no-store" })
      .then((r) => r.json())
      .then((p: SecurityPolicy) => {
        setSaved(p);
        setDraft(p);
      });
  }, []);

  if (!draft || !saved) return <Empty icon={ShieldCheck}>Loading…</Empty>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = (a: Audience, patch: Partial<SecurityPolicy[Audience]>) => setDraft((d) => (d ? { ...d, [a]: { ...d[a], ...patch } } : d));
  const toggle = (a: Audience, m: MfaMethod) => {
    const methods = draft[a].methods;
    set(a, { methods: methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m] });
  };

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/security", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(body.error ?? "Couldn't save.");
    setSaved(body);
    setDraft(body);
    toast("Sign-in security saved. It applies from each person's next sign-in.");
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Panel>
        <div className="row between">
          <p className="hint" style={{ margin: 0, maxWidth: "70ch" }}>
            Two-step sign-in for each kind of account. People turn methods on from their own Security page; this decides what
            they&rsquo;re offered and whether it&rsquo;s required. Required takes effect at their next sign-in, and they can&rsquo;t reach
            anything else until one method is set up.
          </p>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !dirty}>
            {busy ? <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" /> : <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
            {dirty ? "Save policy" : "Saved"}
          </button>
        </div>
      </Panel>

      <div className="policy-grid">
        {AUDIENCES.map((a) => {
          const p = draft[a.key];
          return (
            <Panel key={a.key} title={a.label} icon={ShieldCheck}>
              <p className="hint" style={{ marginTop: -4 }}>
                {a.detail}
              </p>
              <div className="label">Two-step sign-in</div>
              <div className="segmented" role="radiogroup" aria-label={`Two-step sign-in for ${a.label}`}>
                {REQUIREMENTS.map((r) => (
                  <button key={r.key} type="button" role="radio" aria-checked={p.requirement === r.key} onClick={() => set(a.key, { requirement: r.key })} title={r.hint}>
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="hint">{REQUIREMENTS.find((r) => r.key === p.requirement)?.hint}</p>

              <fieldset className="policy-methods" disabled={p.requirement === "off"}>
                <legend className="label">Methods they can use</legend>
                {MFA_METHODS.map((m) => (
                  <div key={m.key} className={`policy-method${p.methods.includes(m.key) ? " on" : ""}`}>
                    <div>
                      <div className="t">{m.label}</div>
                      <div className="hint">{m.detail}</div>
                    </div>
                    <Toggle
                      size="sm"
                      checked={p.methods.includes(m.key)}
                      disabled={p.requirement === "off"}
                      label={`${m.label} for ${a.label}`}
                      onChange={() => toggle(a.key, m.key)}
                    />
                  </div>
                ))}
              </fieldset>

              <label className="f" style={{ marginTop: 12 }}>
                Remember a device for
                <select value={p.rememberDays} disabled={p.requirement === "off"} onChange={(e) => set(a.key, { rememberDays: Number(e.target.value) })}>
                  {REMEMBER_CHOICES.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? "Never: ask every time" : `${d} day${d === 1 ? "" : "s"}`}
                    </option>
                  ))}
                </select>
              </label>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
