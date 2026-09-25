"use client";

import {
  CircleAlert,
  CircleCheck,
  ImagePlus,
  LayoutDashboard,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CompanyLogo } from "@/components/layout/CompanyBrand";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import {
  brandTokens,
  contrastReport,
  DEFAULT_PRIMARY,
  DEFAULT_RAIL,
  isHex,
  PRESETS,
  WORDMARK_ASPECT,
  type Branding,
  type LogoTile,
} from "@/lib/branding";
import { companyById } from "@/lib/reference/companies";
import { useActions, useAppState } from "@/store/StoreProvider";
import { ACCEPT, processLogo, type ProcessedLogo } from "./logoProcessing";

/** Surfaces for the preview, so it shows either theme whatever the app is in. */
const SURFACES = {
  light: { "--bg": "#f1f6f4", "--panel": "#ffffff", "--panel2": "#eef4f1", "--ink": "#0f1f1b", "--muted": "#667a73", "--line": "#e0ebe6" },
  dark: { "--bg": "#061a1b", "--panel": "#0c2526", "--panel2": "#123031", "--ink": "#e4f1ec", "--muted": "#88a59c", "--line": "#1b3b3c" },
};

const TILE_OPTIONS: { id: LogoTile; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "A light tile only if the logo would be hard to see on the sidebar." },
  { id: "light", label: "Light tile", hint: "Always seat the logo on a white tile." },
  { id: "none", label: "No tile", hint: "Place the logo straight on the sidebar colour." },
];

function HexField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="bs-color">
      <label className="bs-swatch-input" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
      </label>
      <label className="f">
        {label}
        <input
          className="mono"
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const full = v.startsWith("#") ? v : `#${v}`;
            if (isHex(full)) onChange(full.toLowerCase());
          }}
        />
      </label>
    </div>
  );
}

export function BrandingSettings({ company }: { company: string }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const saved = s.branding[company];
  const name = companyById(company).name;

  const [draft, setDraft] = useState<Branding>(() => saved ?? {});
  const [pending, setPending] = useState<ProcessedLogo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [busy, setBusy] = useState<"" | "processing" | "saving" | "resetting">("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [customRail, setCustomRail] = useState(Boolean(saved?.rail));
  const inputRef = useRef<HTMLInputElement>(null);

  // A different company, or a save landing from the sync, resets the editor.
  const savedKey = `${company}|${saved?.updatedAt ?? ""}`;
  const [lastKey, setLastKey] = useState(savedKey);
  if (savedKey !== lastKey) {
    setLastKey(savedKey);
    setDraft(saved ?? {});
    setCustomRail(Boolean(saved?.rail));
    setPending(null);
    setFile(null);
  }

  useEffect(() => () => void (pending && URL.revokeObjectURL(pending.url)), [pending]);

  const primary = draft.primary ?? DEFAULT_PRIMARY;
  const effective: Branding = {
    ...draft,
    primary,
    rail: customRail ? (draft.rail ?? DEFAULT_RAIL) : undefined,
    ...(pending ? { logo: "pending", logoAspect: pending.aspect, logoLuma: pending.luma } : {}),
  };
  const tokens = brandTokens(effective)!;
  const checks = contrastReport(effective);
  const logoSrc = pending?.url ?? (draft.logo ? `/api/files/${draft.logo}` : null);
  const palette = pending?.palette ?? [];
  // What Save would send, against what's stored now.
  const payload = { primary, rail: effective.rail, logo: draft.logo, logoTile: draft.logoTile ?? "auto" };
  const stored = {
    primary: saved?.primary ?? DEFAULT_PRIMARY,
    rail: saved?.rail,
    logo: saved?.logo,
    logoTile: saved?.logoTile ?? "auto",
  };
  const dirty = Boolean(pending) || JSON.stringify(payload) !== JSON.stringify(stored);

  const run = async (f: File, remove: boolean) => {
    setBusy("processing");
    setError("");
    try {
      const out = await processLogo(f, { removeBackground: remove });
      setPending(out);
      setFile(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that logo.");
    } finally {
      setBusy("");
    }
  };

  const pick = (f: File | undefined | null) => {
    if (f) void run(f, removeBg);
  };

  // Paste a logo straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        pick(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const save = async () => {
    setBusy("saving");
    setError("");
    try {
      let logo = draft.logo;
      let logoAspect = draft.logoAspect;
      let logoLuma = draft.logoLuma;
      if (pending) {
        const res = await fetch(`/api/branding/${company}/logo`, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: pending.blob,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "The logo didn't upload.");
        logo = body.id;
        logoAspect = pending.aspect;
        logoLuma = pending.luma;
      }
      const res = await fetch(`/api/branding/${company}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary,
          rail: customRail ? (draft.rail ?? DEFAULT_RAIL) : undefined,
          logo,
          logoAspect: logo ? logoAspect : undefined,
          logoLuma: logo ? logoLuma : undefined,
          logoTile: draft.logoTile ?? "auto",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save the branding.");
      await actions.refresh();
      toast(`${name} branding saved. Staff, clients and collectors see it now.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the branding.");
    } finally {
      setBusy("");
    }
  };

  const reset = async () => {
    if (!window.confirm(`Remove ${name}'s logo and colours and go back to the Zoa look?`)) return;
    setBusy("resetting");
    const res = await fetch(`/api/branding/${company}`, { method: "DELETE" });
    setBusy("");
    if (!res.ok) return setError("Couldn't reset the branding.");
    await actions.refresh();
    setDraft({});
    setPending(null);
    setCustomRail(false);
    toast(`${name} is back on the Zoa look.`);
  };

  const previewStyle = { ...SURFACES[mode], ...tokens[mode] } as CSSProperties;
  const wide = (effective.logoAspect ?? 1) >= WORDMARK_ASPECT;

  return (
    <div className="bs-grid">
      <div className="stack" style={{ gap: 20 }}>
        <Panel title="Logo" icon={ImagePlus}>
          <div
            className={`bs-drop${dragging ? " over" : ""}${logoSrc ? " has-logo" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
          >
            {logoSrc ? (
              <div className="bs-logo-stage">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob or auth-gated file */}
                <img src={logoSrc} alt={`${name} logo`} />
              </div>
            ) : (
              <div className="bs-drop-empty">
                <span className="bs-drop-ico" aria-hidden="true">
                  <Upload size={22} strokeWidth={2} />
                </span>
                <b>Drop your logo here</b>
                <span className="hint">or paste it, or choose a file. PNG, SVG, JPEG or WebP.</span>
              </div>
            )}
            <div className="row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn small" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>
                <Upload size={15} strokeWidth={2.2} aria-hidden="true" />
                {logoSrc ? "Replace logo" : "Choose file"}
              </button>
              {logoSrc && (
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    setPending(null);
                    setFile(null);
                    setDraft((d) => ({ ...d, logo: undefined, logoAspect: undefined, logoLuma: undefined }));
                  }}
                  disabled={Boolean(busy)}
                >
                  <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {busy === "processing" && <p className="hint">Trimming and fitting your logo…</p>}

          {pending && (
            <ul className="bs-facts">
              <li>
                <CircleCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                Trimmed to {pending.width} × {pending.height}px ·{" "}
                {pending.aspect >= WORDMARK_ASPECT ? "shown as a full-width wordmark" : "shown as a mark beside your name"}
              </li>
              {pending.background && (
                <li>
                  <CircleCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                  Solid background{" "}
                  <span className="bs-chip-swatch" style={{ background: pending.background }} />{" "}
                  {removeBg ? "removed" : "kept"}
                </li>
              )}
              {pending.lowRes && (
                <li className="warn">
                  <TriangleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
                  Low resolution — it may look soft. An SVG or a PNG at least 256px wide is best.
                </li>
              )}
            </ul>
          )}

          <label className="bs-toggle">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(e) => {
                setRemoveBg(e.target.checked);
                if (file) void run(file, e.target.checked);
              }}
            />
            <span>
              Remove a solid background
              <small className="hint">Clears white or flat backdrops so the logo sits cleanly on any colour.</small>
            </span>
          </label>

          <div className="bs-field">
            <span className="bs-label">Backing</span>
            <div className="segmented" role="radiogroup" aria-label="Logo backing">
              {TILE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={(draft.logoTile ?? "auto") === o.id}
                  onClick={() => setDraft((d) => ({ ...d, logoTile: o.id }))}
                  title={o.hint}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="hint">{TILE_OPTIONS.find((o) => o.id === (draft.logoTile ?? "auto"))?.hint}</p>
          </div>
        </Panel>

        <Panel title="Colours" icon={Palette}>
          <div className="bs-field">
            <span className="bs-label">Presets</span>
            <div className="bs-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="bs-preset"
                  aria-pressed={primary === p.primary && (!customRail || draft.rail === p.rail)}
                  onClick={() => {
                    setDraft((d) => ({ ...d, primary: p.primary, rail: p.rail }));
                    setCustomRail(true);
                  }}
                  title={p.name}
                >
                  <span style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.rail} 50%)` }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {palette.length > 0 && (
            <div className="bs-field">
              <span className="bs-label">
                <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" /> From your logo
              </span>
              <div className="bs-palette">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="bs-dot"
                    style={{ background: c }}
                    aria-label={`Use ${c}`}
                    aria-pressed={primary === c}
                    onClick={() => setDraft((d) => ({ ...d, primary: c }))}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}

          <HexField label="Primary colour" value={primary} onChange={(v) => setDraft((d) => ({ ...d, primary: v }))} />
          <p className="hint" style={{ marginTop: -4 }}>Buttons, links, highlights and charts.</p>

          <div className="bs-field">
            <span className="bs-label">Sidebar</span>
            <div className="segmented" role="radiogroup" aria-label="Sidebar colour">
              <button type="button" role="radio" aria-checked={!customRail} onClick={() => setCustomRail(false)}>
                Match primary
              </button>
              <button type="button" role="radio" aria-checked={customRail} onClick={() => setCustomRail(true)}>
                Custom
              </button>
            </div>
          </div>
          {customRail && (
            <HexField
              label="Sidebar colour"
              value={draft.rail ?? DEFAULT_RAIL}
              onChange={(v) => setDraft((d) => ({ ...d, rail: v }))}
            />
          )}

          <div className="bs-checks">
            <span className="bs-label">Legibility</span>
            {checks.map((c) => (
              <div key={c.label} className="bs-check">
                {c.ratio >= c.min ? (
                  <CircleCheck size={15} strokeWidth={2.2} className="ok" aria-hidden="true" />
                ) : (
                  <CircleAlert size={15} strokeWidth={2.2} className="bad" aria-hidden="true" />
                )}
                <span>{c.label}</span>
                <span className="mono">{c.ratio.toFixed(1)}:1</span>
                {c.adjusted && <span className="hint">tuned for contrast</span>}
              </div>
            ))}
            <p className="hint">Shades are adjusted automatically so text always meets WCAG AA.</p>
          </div>
        </Panel>
      </div>

      <div className="bs-preview-col">
        <Panel
          title="Preview"
          icon={LayoutDashboard}
          aside={
            <div className="segmented" role="radiogroup" aria-label="Preview theme">
              <button type="button" role="radio" aria-checked={mode === "light"} onClick={() => setMode("light")} title="Light">
                <Sun size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button type="button" role="radio" aria-checked={mode === "dark"} onClick={() => setMode("dark")} title="Dark">
                <Moon size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          }
        >
          <div className="bp" style={previewStyle} aria-label="Branding preview">
            <div className="bp-rail">
              <div className="brand bp-brand">
                {logoSrc ? (
                  <CompanyLogo branding={effective} name={name} sub="on Zoa Waste Hub" src={logoSrc} railHex={tokens[mode]["--rail"]} />
                ) : (
                  <>
                    <span className="bp-monogram">{name.slice(0, 1)}</span>
                    <div>
                      <b>{name}</b>
                      <small>on Zoa Waste Hub</small>
                    </div>
                  </>
                )}
              </div>
              <div className="bp-nav">
                <span className="bp-nav-item active">
                  <i>
                    <LayoutDashboard size={13} strokeWidth={2.2} />
                  </i>
                  Dashboard
                </span>
                <span className="bp-nav-item">
                  <i>
                    <Users size={13} strokeWidth={2.2} />
                  </i>
                  Clients
                </span>
                <span className="bp-nav-item">
                  <i>
                    <Wallet size={13} strokeWidth={2.2} />
                  </i>
                  Payments
                </span>
              </div>
            </div>
            <div className="bp-main">
              <div className="bp-tabs">
                <span className="active">Overview</span>
                <span>Billing</span>
              </div>
              <div className="bp-card">
                <span className="bp-label">Collected this month</span>
                <b className="bp-value">KES 482,300</b>
                <div className="bp-bar">
                  <i style={{ width: "72%" }} />
                </div>
                <span className="bp-link">View statement →</span>
              </div>
              <div className="bp-actions">
                <span className="bp-btn">Pay with M-Pesa</span>
                <span className="bp-chip">Paid</span>
              </div>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {logoSrc
              ? wide
                ? "Wide logos take the whole sidebar header on their own."
                : "Square logos sit in the 38px mark beside your company name."
              : "Add a logo to replace the monogram."}
          </p>
        </Panel>
      </div>

      <div className="bs-footer">
        {error && (
          <p className="err" role="alert">
            <CircleAlert size={15} strokeWidth={2.2} aria-hidden="true" />
            {error}
          </p>
        )}
        <div className="row" style={{ marginLeft: "auto" }}>
          {saved && (
            <button type="button" className="btn ghost" onClick={() => void reset()} disabled={Boolean(busy)}>
              <RotateCcw size={15} strokeWidth={2.2} aria-hidden="true" />
              Reset to Zoa default
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => void save()} disabled={!dirty || Boolean(busy)}>
            {busy === "saving" ? "Saving…" : "Save branding"}
          </button>
        </div>
      </div>
    </div>
  );
}
