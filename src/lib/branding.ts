/*
 * Branding in two layers. The platform brand (scope "platform") names and
 * styles the whole system; each company can lay its own logo and colours on
 * top for its staff, clients and collectors. Anything a company leaves unset
 * falls through to the platform, and anything the platform leaves unset falls
 * through to the built-in Zoa look.
 *
 * Colours are worked in OKLCH so a lightness step looks the same for any hue,
 * and every derived pair is pushed until it meets WCAG contrast — any colour
 * can be picked and the interface stays readable.
 */

export type LogoTile = "auto" | "light" | "none";
/** Where the browser-tab icon comes from; "none" falls through to the layer below. */
export type FaviconMode = "logo" | "monogram" | "upload" | "none";

/** The settings scope that holds the platform brand. */
export const PLATFORM = "platform";

/** Built-in identity, used until the platform admin sets their own. */
export const PLATFORM_NAME = "Zoa";
export const PLATFORM_TAGLINE = "Waste Hub";
export const NAME_MAX = 24;
export const TAGLINE_MAX = 40;

export interface Identity {
  /** "Zoa" — short, for page titles and the app icon label. */
  name: string;
  /** "Waste Hub" — the line under the name; may be empty. */
  tagline: string;
  /** "Zoa Waste Hub" */
  full: string;
}

export function identity(platform?: Branding): Identity {
  const name = platform?.name?.trim() || PLATFORM_NAME;
  const tagline = platform?.tagline ?? PLATFORM_TAGLINE;
  return { name, tagline, full: tagline ? `${name} ${tagline}` : name };
}

/** The line under a company's name in the sidebar, unless it sets its own. */
export const companyTagline = (platform?: Branding) => `on ${identity(platform).full}`;

/** Whose colours apply: a company with its own wins, else the platform's. */
export function resolveColours(company: Branding | undefined, platform: Branding | undefined): Branding {
  const own = company && (isHex(company.primary) || isHex(company.rail));
  const src = own ? company : platform;
  return { primary: src?.primary, rail: src?.rail };
}

export interface Branding {
  /** Platform only: the product name that replaces "Zoa". */
  name?: string;
  /** "#rrggbb" — buttons, links, highlights. */
  primary?: string;
  /** "#rrggbb" — the sidebar. Derived from the primary when unset. */
  rail?: string;
  /** Stored file id of the processed, trimmed PNG. */
  logo?: string;
  /** Width ÷ height of the trimmed logo. */
  logoAspect?: number;
  /** Mean relative luminance of the logo's visible pixels, 0–1. */
  logoLuma?: number;
  logoTile?: LogoTile;
  /** Sidebar line under the name; "" hides it, unset shows DEFAULT_TAGLINE. */
  tagline?: string;
  /** Stored file id of the 64 × 64 PNG tab icon. */
  favicon?: string;
  faviconMode?: FaviconMode;
  updatedAt?: string;
}

export const DEFAULT_PRIMARY = "#12924f";
export const DEFAULT_RAIL = "#093c3d";

/** Hand-picked starting points that all pass contrast in both themes. */
export const PRESETS: { name: string; primary: string; rail: string }[] = [
  { name: "Zoa leaf", primary: "#12924f", rail: "#093c3d" },
  { name: "Ocean", primary: "#0e7490", rail: "#0b2f3a" },
  { name: "Royal", primary: "#3b5bdb", rail: "#141d3d" },
  { name: "Violet", primary: "#7048e8", rail: "#221640" },
  { name: "Sunset", primary: "#e8590c", rail: "#3a1a0c" },
  { name: "Ruby", primary: "#c2255c", rail: "#3a0f22" },
  { name: "Amber", primary: "#e0a100", rail: "#2e2508" },
  { name: "Graphite", primary: "#495057", rail: "#16191c" },
];

/* ---------------- colour maths ---------------- */

type Rgb = [number, number, number]; // 0–255
interface Oklch {
  l: number;
  c: number;
  h: number;
}

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]: Rgb): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** Back to sRGB, easing chroma off until the colour fits the gamut. */
function oklchToRgb(color: Oklch): Rgb {
  const l = Math.min(1, Math.max(0, color.l));
  let lo = 0;
  let hi = color.c;
  let lin = oklchToLinear({ ...color, l });
  const inGamut = (v: Rgb) => v.every((x) => x >= -0.0005 && x <= 1.0005);
  if (!inGamut(lin)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, l, c: mid }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ ...color, l, c: lo });
  }
  return lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb;
}

const hex = (c: Oklch) => rgbToHex(oklchToRgb(c));
const lch = (h: string) => rgbToOklch(hexToRgb(h));

/** WCAG relative luminance. */
export function luminance(color: string | Rgb): number {
  const [r, g, b] = typeof color === "string" ? hexToRgb(color) : color;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Step lightness toward `dir` until the colour reaches `min` contrast on `bg`. */
function reach(color: Oklch, bg: string, min: number, dir: 1 | -1): Oklch {
  let c = { ...color };
  for (let i = 0; i < 60 && contrast(hex(c), bg) < min; i++) {
    const l = c.l + dir * 0.01;
    if (l <= 0 || l >= 1) break;
    c = { ...c, l };
  }
  return c;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const rgba = (h: string, alpha: number) => {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* ---------------- tokens ---------------- */

/** Surfaces the accent must read against; mirrors tokens.css. */
const SURFACE = { light: { panel: "#ffffff", bg: "#f1f6f4" }, dark: { panel: "#0c2526", bg: "#061a1b" } };

export type Tokens = Record<string, string>;

/**
 * A button fill and the ink on it: whichever of near-black or white reads
 * better, with the fill nudged away from the ink until the pair passes AA.
 */
function filled(fill: Oklch, hue: number): { fill: Oklch; ink: string } {
  const dark = hex({ l: 0.2, c: 0.04, h: hue });
  const f = hex(fill);
  const ink = contrast(dark, f) >= contrast("#ffffff", f) ? dark : "#ffffff";
  let c = { ...fill };
  const away = ink === "#ffffff" ? -1 : 1;
  for (let i = 0; i < 40 && contrast(ink, hex(c)) < 4.5; i++) c = { ...c, l: c.l + away * 0.01 };
  return { fill: c, ink };
}

function accentTokens(primary: string, mode: "light" | "dark"): Tokens {
  const base = lch(primary);
  const surface = SURFACE[mode];

  if (mode === "light") {
    // Text and icons: at least AA on white and on the canvas.
    const accent = reach(reach(base, surface.panel, 4.5, -1), surface.bg, 4.5, -1);
    const { fill, ink } = filled({ ...base, l: clamp(base.l, 0.42, 0.86) }, base.h);
    const fillHex = hex(fill);
    return {
      "--accent": hex(accent),
      "--accent-2": hex({ ...accent, l: accent.l - 0.08 }),
      "--accent-soft": hex({ l: 0.95, c: Math.min(base.c, 0.045), h: base.h }),
      "--accent-ink": ink,
      "--leaf": fillHex,
      "--chart-1": hex(accent),
      "--accent-grad": `linear-gradient(180deg, ${hex({ ...fill, l: fill.l + 0.06 })} 0%, ${fillHex} 55%, ${hex({ ...fill, l: fill.l - 0.05 })} 100%)`,
      "--accent-glow": `0 8px 20px -6px ${rgba(fillHex, 0.5)}`,
    };
  }

  const accent = reach({ ...base, l: Math.max(base.l, 0.72) }, surface.panel, 4.5, 1);
  const { fill, ink } = filled({ ...base, l: clamp(Math.max(base.l, 0.68), 0.6, 0.88) }, base.h);
  const fillHex = hex(fill);
  return {
    "--accent": hex(accent),
    "--accent-2": hex({ ...accent, l: accent.l - 0.12 }),
    "--accent-soft": hex({ l: 0.3, c: Math.min(base.c, 0.06), h: base.h }),
    "--accent-ink": ink,
    "--leaf": fillHex,
    "--chart-1": hex({ ...accent, l: accent.l - 0.08 }),
    "--accent-grad": `linear-gradient(180deg, ${hex({ ...fill, l: fill.l + 0.05 })} 0%, ${fillHex} 55%, ${hex({ ...fill, l: fill.l - 0.04 })} 100%)`,
    "--accent-glow": `0 8px 22px -6px ${rgba(fillHex, 0.35)}`,
  };
}

/** The sidebar: dark rails get light ink and vice versa, each pushed to AA. */
function railTokens(primary: string, rail: string | undefined, mode: "light" | "dark"): Tokens {
  const base = rail ? lch(rail) : { l: 0.3, c: Math.min(lch(primary).c, 0.06), h: lch(primary).h };
  const light = base.l > 0.62;

  if (light) {
    const surface = { ...base, l: mode === "dark" ? 0.9 : base.l };
    const railHex = hex(surface);
    return {
      "--rail": railHex,
      "--rail-panel": hex({ ...surface, l: surface.l - 0.06 }),
      "--rail-ink": hex(reach({ l: 0.48, c: Math.min(base.c, 0.04), h: base.h }, railHex, 4.5, -1)),
      "--rail-ink-strong": hex({ l: 0.2, c: Math.min(base.c, 0.04), h: base.h }),
    };
  }

  const surface = { ...base, l: mode === "dark" ? Math.min(base.l, 0.2) : Math.min(base.l, 0.36) };
  const railHex = hex(surface);
  return {
    "--rail": railHex,
    "--rail-panel": hex({ ...surface, l: surface.l + 0.07 }),
    "--rail-ink": hex(reach({ l: 0.78, c: Math.min(base.c, 0.035), h: base.h }, railHex, 4.5, 1)),
    "--rail-ink-strong": "#ffffff",
  };
}

export function brandTokens(b: Branding): { light: Tokens; dark: Tokens } | null {
  if (!isHex(b.primary) && !isHex(b.rail)) return null;
  const primary = isHex(b.primary) ? b.primary : DEFAULT_PRIMARY;
  const rail = isHex(b.rail) ? b.rail : undefined;
  return {
    light: { ...accentTokens(primary, "light"), ...railTokens(primary, rail, "light") },
    dark: { ...accentTokens(primary, "dark"), ...railTokens(primary, rail, "dark") },
  };
}

const decl = (t: Tokens) =>
  Object.entries(t)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

/**
 * A stylesheet that re-points the tokens. Selectors match tokens.css one for
 * one, so being later in the document is what makes them win, and the dark
 * overrides only apply exactly when the dark theme does.
 */
export function brandCss(b: Branding): string {
  const t = brandTokens(b);
  if (!t) return "";
  return [
    `:root{${decl(t.light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(t.dark)}}}`,
    `:root[data-theme="dark"]{${decl(t.dark)}}`,
  ].join("\n");
}

/* ---------------- checks shown to the admin ---------------- */

export interface ContrastCheck {
  label: string;
  ratio: number;
  min: number;
  /** The picked colour was shifted to get there. */
  adjusted: boolean;
}

export function contrastReport(b: Branding): ContrastCheck[] {
  const t = brandTokens(b);
  if (!t) return [];
  const primary = isHex(b.primary) ? b.primary : DEFAULT_PRIMARY;
  const fill = (tokens: Tokens) => tokens["--leaf"];
  return [
    {
      label: "Button text",
      ratio: Math.min(contrast(t.light["--accent-ink"], fill(t.light)), contrast(t.dark["--accent-ink"], fill(t.dark))),
      min: 4.5,
      adjusted: false,
    },
    {
      label: "Links & icons (light)",
      ratio: contrast(t.light["--accent"], SURFACE.light.panel),
      min: 4.5,
      adjusted: t.light["--accent"].toLowerCase() !== primary.toLowerCase(),
    },
    {
      label: "Links & icons (dark)",
      ratio: contrast(t.dark["--accent"], SURFACE.dark.panel),
      min: 4.5,
      adjusted: t.dark["--accent"].toLowerCase() !== primary.toLowerCase(),
    },
    {
      label: "Sidebar text",
      ratio: contrast(t.light["--rail-ink"], t.light["--rail"]),
      min: 4.5,
      adjusted: false,
    },
  ];
}

/** Whether the logo needs a light tile behind it to read on this sidebar. */
export function logoNeedsTile(b: Branding, railHex: string): boolean {
  if (b.logoTile === "light") return true;
  if (b.logoTile === "none") return false;
  const luma = b.logoLuma ?? 0.5;
  const railLuma = luminance(railHex);
  return (Math.max(luma, railLuma) + 0.05) / (Math.min(luma, railLuma) + 0.05) < 3;
}

/** Logos wider than this sit alone as a wordmark rather than beside the name. */
export const WORDMARK_ASPECT = 1.8;
