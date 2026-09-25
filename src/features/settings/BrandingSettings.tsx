"use client";

import {
  CircleAlert,
  CircleCheck,
  Globe,
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
  Type,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CompanyLogo } from "@/components/layout/CompanyBrand";
import { usePlatformBrand } from "@/components/layout/PlatformBrand";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import {
  brandTokens,
  contrastReport,
  DEFAULT_PRIMARY,
  DEFAULT_RAIL,
  companyTagline,
  identity,
  isHex,
  NAME_MAX,
  PLATFORM,
  PLATFORM_NAME,
  PLATFORM_TAGLINE,
  PRESETS,
  TAGLINE_MAX,
  WORDMARK_ASPECT,
  type Branding,
  type FaviconMode,
  type LogoTile,
} from "@/lib/branding";
import { companyById } from "@/lib/reference/companies";
import { useActions, useAppState } from "@/store/StoreProvider";
import { ACCEPT, makeFavicon, processLogo, type Favicon, type ProcessedLogo } from "./logoProcessing";

/** Surfaces for the preview, so it shows either theme whatever the app is in. */
const SURFACES = {
  light: { "--bg": "#f1f6f4", "--panel": "#ffffff", "--panel2": "#eef4f1", "--ink": "#0f1f1b", "--muted": "#667a73", "--line": "#e0ebe6" },
  dark: { "--bg": "#061a1b", "--panel": "#0c2526", "--panel2": "#123031", "--ink": "#e4f1ec", "--muted": "#88a59c", "--line": "#1b3b3c" },
};

const FAVICON_OPTIONS: { id: FaviconMode; label: string }[] = [
  { id: "logo", label: "From logo" },
  { id: "monogram", label: "Monogram" },
  { id: "upload", label: "Upload" },
  { id: "none", label: "Default" },
];

/** A browser tab strip, to judge the icon at the size people will actually see it. */
function TabMock({ src, title, dark }: { src: string | null; title: string; dark?: boolean }) {
  return (
    <div className={`bs-tab${dark ? " dark" : ""}`}>
      <span className="bs-tab-icon">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob or auth-gated file */}
        {src ? <img src={src} alt="" width={16} height={16} /> : <Globe size={14} strokeWidth={2} aria-hidden="true" />}
      </span>
      <span className="bs-tab-title">{title}</span>
      <X size={12} strokeWidth={2.4} aria-hidden="true" />
    </div>
  );
}

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

/**
 * Brand editor for one layer: `scope` is a company id, or PLATFORM for the
 * look of the whole system. Companies inherit whatever they leave unset.
 */
export function BrandingSettings({ scope }: { scope: string }) {
  const s = useAppState();
  const actions = useActions();
  const router = useRouter();
  const toast = useToast();
  const { branding: platformB } = usePlatformBrand();
  const isPlatform = scope === PLATFORM;
  const saved = isPlatform ? (platformB.updatedAt ? platformB : undefined) : s.branding[scope];

  const [draft, setDraft] = useState<Branding>(() => saved ?? {});
  // A company can follow the platform's colours, or set its own.
  const [ownColours, setOwnColours] = useState(isPlatform || Boolean(saved?.primary || saved?.rail));
  const [pending, setPending] = useState<ProcessedLogo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [busy, setBusy] = useState<"" | "processing" | "saving" | "resetting">("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [customRail, setCustomRail] = useState(Boolean(saved?.rail));
  const [faviconMode, setFaviconMode] = useState<FaviconMode>(saved?.faviconMode ?? "none");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<Favicon | null>(null);
  const [faviconError, setFaviconError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // A different company, or a save landing from the sync, resets the editor.
  const savedKey = `${scope}|${saved?.updatedAt ?? ""}`;
  const [lastKey, setLastKey] = useState(savedKey);
  if (savedKey !== lastKey) {
    setLastKey(savedKey);
    setDraft(saved ?? {});
    setOwnColours(isPlatform || Boolean(saved?.primary || saved?.rail));
    setCustomRail(Boolean(saved?.rail));
    setPending(null);
    setFile(null);
    setFaviconMode(saved?.faviconMode ?? "none");
    setFaviconFile(null);
  }

  useEffect(() => () => void (pending && URL.revokeObjectURL(pending.url)), [pending]);

  // What this layer falls back to: the platform for a company, the built-in look for the platform.
  const basePrimary = isPlatform ? DEFAULT_PRIMARY : (platformB.primary ?? DEFAULT_PRIMARY);
  const baseRail = isPlatform ? undefined : platformB.rail;
  const primary = ownColours ? (draft.primary ?? basePrimary) : basePrimary;
  const rail = ownColours ? (customRail ? (draft.rail ?? DEFAULT_RAIL) : undefined) : baseRail;
  const productName = draft.name?.trim() || PLATFORM_NAME;
  const name = isPlatform ? productName : companyById(scope).name;
  const effective: Branding = {
    ...draft,
    primary,
    rail,
    ...(pending ? { logo: "pending", logoAspect: pending.aspect, logoLuma: pending.luma } : {}),
  };
  const tokens = brandTokens(effective)!;
  const checks = contrastReport(effective);
  const logoSrc = pending?.url ?? (draft.logo ? `/api/files/${draft.logo}` : null);
  const palette = pending?.palette ?? [];
  const defaultTagline = isPlatform ? PLATFORM_TAGLINE : companyTagline(platformB);
  const tagline = draft.tagline ?? defaultTagline;
  const defaultLabel = isPlatform ? "Zoa default" : "Platform default";

  // The tab icon is redrawn from whatever it depends on, so the preview is always current.
  const fill = tokens.light["--leaf"];
  const ink = tokens.light["--accent-ink"];
  /** Everything the icon is drawn from; if it differs from the saved set, re-upload. */
  const faviconSig = (m: FaviconMode, logo: string | null, colours: string, uploadKey: string | undefined) =>
    m === "logo" ? `logo|${logo}` : m === "monogram" ? `mono|${colours}|${name}` : m === "upload" ? `up|${uploadKey}` : "none";
  const savedColours = isPlatform ? saved : saved?.primary || saved?.rail ? saved : platformB;
  const savedTokens = saved
    ? brandTokens({ primary: savedColours?.primary ?? DEFAULT_PRIMARY, rail: savedColours?.rail })
    : null;
  const savedSig = faviconSig(
    saved?.faviconMode ?? "none",
    saved?.logo ? `/api/files/${saved.logo}` : null,
    savedTokens ? `${savedTokens.light["--leaf"]}${savedTokens.light["--accent-ink"]}` : "",
    saved?.favicon,
  );
  const currentSig = faviconSig(
    faviconMode,
    logoSrc,
    `${fill}${ink}`,
    faviconFile ? `${faviconFile.name}:${faviconFile.size}:${faviconFile.lastModified}` : draft.favicon,
  );
  // Needs a new upload on save: the inputs moved, or there's no stored icon yet.
  const faviconStale = faviconMode !== "none" && (currentSig !== savedSig || !saved?.favicon);

  useEffect(() => {
    let cancelled = false;
    setFaviconError("");
    const next =
      faviconMode === "monogram"
        ? makeFavicon({ mode: "monogram", name, fill, ink })
        : faviconMode === "logo" && logoSrc
          ? makeFavicon({ mode: "logo", src: logoSrc })
          : faviconMode === "upload" && faviconFile
            ? makeFavicon({ mode: "upload", file: faviconFile })
            : null;
    if (!next) {
      setFavicon(null);
      return;
    }
    next
      .then((f) => {
        if (cancelled) return URL.revokeObjectURL(f.url);
        setFavicon((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return f;
        });
      })
      .catch((err) => !cancelled && setFaviconError(err instanceof Error ? err.message : "Couldn't make the tab icon."));
    return () => {
      cancelled = true;
    };
  }, [faviconMode, logoSrc, faviconFile, name, fill, ink]);

  // What the tab shows: a fresh drawing, else the stored icon for an untouched upload.
  const faviconSrc =
    favicon?.url ?? (faviconMode === "upload" && !faviconFile && draft.favicon ? `/api/files/${draft.favicon}` : null);

  // What Save would send, against what's stored now.
  const payload = {
    name: isPlatform ? productName : undefined,
    primary: ownColours ? primary : undefined,
    rail: ownColours ? rail : undefined,
    logo: draft.logo,
    logoTile: draft.logoTile ?? "auto",
    tagline,
    faviconMode,
  };
  const stored = {
    name: isPlatform ? (saved?.name ?? PLATFORM_NAME) : undefined,
    primary: isPlatform ? (saved?.primary ?? DEFAULT_PRIMARY) : saved?.primary,
    rail: saved?.rail,
    logo: saved?.logo,
    logoTile: saved?.logoTile ?? "auto",
    tagline: saved?.tagline ?? defaultTagline,
    faviconMode: saved?.faviconMode ?? "none",
  };
  const dirty =
    Boolean(pending) || JSON.stringify(payload) !== JSON.stringify(stored) || (faviconStale && Boolean(favicon));

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

  const upload = async (blob: Blob, what: string) => {
    const res = await fetch(`/api/branding/${scope}/logo`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: blob,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `The ${what} didn't upload.`);
    return body.id as string;
  };

  const save = async () => {
    setBusy("saving");
    setError("");
    try {
      let logo = draft.logo;
      let logoAspect = draft.logoAspect;
      let logoLuma = draft.logoLuma;
      if (pending) {
        logo = await upload(pending.blob, "logo");
        logoAspect = pending.aspect;
        logoLuma = pending.luma;
      }
      let faviconId = faviconMode === "none" ? undefined : draft.favicon;
      if (faviconMode !== "none" && faviconStale) {
        if (!favicon) throw new Error(`The tab icon isn't ready yet. Pick a source for it, or choose ${defaultLabel}.`);
        faviconId = await upload(favicon.blob, "tab icon");
      }
      const res = await fetch(`/api/branding/${scope}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: isPlatform ? productName : undefined,
          primary: ownColours ? primary : undefined,
          rail: ownColours ? rail : undefined,
          logo,
          logoAspect: logo ? logoAspect : undefined,
          logoLuma: logo ? logoLuma : undefined,
          logoTile: draft.logoTile ?? "auto",
          tagline,
          faviconMode,
          favicon: faviconId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save the branding.");
      await actions.refresh();
      // The platform layer is drawn by the root layout, so redraw that too.
      router.refresh();
      toast(
        isPlatform
          ? `Platform brand saved. Everyone sees ${productName} now, apart from companies' own logos and colours.`
          : `${name} branding saved. Staff, clients and collectors see it now.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the branding.");
    } finally {
      setBusy("");
    }
  };

  const reset = async () => {
    const question = isPlatform
      ? "Remove the platform brand and go back to the built-in Zoa look for everyone?"
      : `Remove ${name}'s logo and colours so it follows the platform brand?`;
    if (!window.confirm(question)) return;
    setBusy("resetting");
    const res = await fetch(`/api/branding/${scope}`, { method: "DELETE" });
    setBusy("");
    if (!res.ok) return setError("Couldn't reset the branding.");
    await actions.refresh();
    router.refresh();
    setDraft({});
    setOwnColours(isPlatform);
    setPending(null);
    setCustomRail(false);
    setFaviconMode("none");
    setFaviconFile(null);
    toast(isPlatform ? "The platform is back on the Zoa look." : `${name} now follows the platform brand.`);
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
                    if (faviconMode === "logo") setFaviconMode("monogram");
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

        <Panel title="Name & tab icon" icon={Type}>
          {isPlatform && (
            <label className="f" style={{ marginBottom: 14 }}>
              <span className="bs-label-row">
                Product name
                <span className="hint mono">
                  {(draft.name ?? PLATFORM_NAME).length}/{NAME_MAX}
                </span>
              </span>
              <input
                value={draft.name ?? PLATFORM_NAME}
                maxLength={NAME_MAX}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
              <span className="hint">
                Replaces “{PLATFORM_NAME}” in the sidebar, sign-in page, browser tabs and emails.
              </span>
            </label>
          )}
          <label className="f">
            <span className="bs-label-row">
              {isPlatform ? "Tagline" : "Sidebar tagline"}
              <span className="hint mono">
                {tagline.length}/{TAGLINE_MAX}
              </span>
            </span>
            <input
              value={tagline}
              maxLength={TAGLINE_MAX}
              placeholder="Leave empty to hide it"
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
            />
          </label>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {tagline !== defaultTagline && (
              <button type="button" className="btn small ghost" onClick={() => setDraft((d) => ({ ...d, tagline: undefined }))}>
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                Use “{defaultTagline}”
              </button>
            )}
            <span className="hint">
              {isPlatform
                ? `Shown after the name, as in “${identity({ name: productName, tagline }).full}”. Empty hides it.`
                : "Shown under your name in the sidebar. Empty hides the line."}
            </span>
          </div>

          <div className="bs-field">
            <span className="bs-label">Tab icon (favicon)</span>
            <div className="segmented" role="radiogroup" aria-label="Tab icon source">
              {FAVICON_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={faviconMode === o.id}
                  disabled={o.id === "logo" && !logoSrc}
                  title={o.id === "logo" && !logoSrc ? "Add a logo first" : undefined}
                  onClick={() => {
                    setFaviconMode(o.id);
                    if (o.id === "upload" && !faviconFile && !draft.favicon) faviconInputRef.current?.click();
                  }}
                >
                  {o.id === "none" ? defaultLabel : o.label}
                </button>
              ))}
            </div>
            <input
              ref={faviconInputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFaviconFile(f);
                  setFaviconMode("upload");
                }
                e.target.value = "";
              }}
            />
          </div>

          <div className="bs-favicon">
            <div className="bs-favicon-big" aria-hidden="true">
              {faviconMode === "none" ? (
                // eslint-disable-next-line @next/next/no-img-element -- the platform icon
                <img src="/icon.svg" alt="" width={48} height={48} />
              ) : faviconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob or auth-gated file
                <img src={faviconSrc} alt="" width={48} height={48} />
              ) : (
                <ImagePlus size={20} strokeWidth={2} />
              )}
            </div>
            <div className="bs-tabs">
              <TabMock src={faviconMode === "none" ? "/icon.svg" : faviconSrc} title={`Dashboard · ${name}`} />
              <TabMock src={faviconMode === "none" ? "/icon.svg" : faviconSrc} title={`Dashboard · ${name}`} dark />
            </div>
          </div>
          {faviconMode === "upload" && (
            <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => faviconInputRef.current?.click()}>
              <Upload size={15} strokeWidth={2.2} aria-hidden="true" />
              {faviconFile || draft.favicon ? "Replace icon" : "Choose icon"}
            </button>
          )}
          {faviconMode === "logo" && wide && (
            <p className="bs-note warn">
              <TriangleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
              Wide logos shrink to a sliver at tab size. Monogram usually reads better.
            </p>
          )}
          {faviconError && (
            <p className="err" role="alert">
              <CircleAlert size={15} strokeWidth={2.2} aria-hidden="true" />
              {faviconError}
            </p>
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            Drawn as a crisp 64 × 64 icon. Staff, clients and collectors see it in their browser tabs.
          </p>
        </Panel>

        <Panel title="Colours" icon={Palette}>
          {!isPlatform && (
            <div className="bs-field" style={{ marginTop: 0 }}>
              <div className="segmented" role="radiogroup" aria-label="Colour source">
                <button type="button" role="radio" aria-checked={!ownColours} onClick={() => setOwnColours(false)}>
                  Platform colours
                </button>
                <button type="button" role="radio" aria-checked={ownColours} onClick={() => setOwnColours(true)}>
                  Custom
                </button>
              </div>
              {!ownColours && (
                <p className="bs-inherit">
                  <span style={{ background: primary }} />
                  <span style={{ background: tokens.light["--rail"] }} />
                  Following the platform brand, including any future changes to it.
                </p>
              )}
            </div>
          )}

          {ownColours && (
          <>
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
                    onClick={() => {
                      setDraft((d) => ({ ...d, primary: c }));
                      setOwnColours(true);
                    }}
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
          </>
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
                  <CompanyLogo
                    branding={{ ...effective, tagline }}
                    name={name}
                    fallbackTagline={defaultTagline}
                    src={logoSrc}
                    railHex={tokens[mode]["--rail"]}
                    size="sm"
                  />
                ) : (
                  <>
                    <span className="bp-monogram">{name.slice(0, 1)}</span>
                    <div>
                      <b>{name}</b>
                      {tagline && <small>{tagline}</small>}
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
                : "Square logos sit in a fixed mark beside your company name."
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
              {isPlatform ? "Reset to Zoa default" : "Use platform branding"}
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
