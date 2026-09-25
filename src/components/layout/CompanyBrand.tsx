"use client";

import { useEffect } from "react";
import {
  brandCss,
  brandTokens,
  DEFAULT_RAIL,
  logoNeedsTile,
  WORDMARK_ASPECT,
  type Branding,
} from "@/lib/branding";
import { BrandMark } from "./BrandMark";

/** The largest w × h with the logo's proportions that fits inside maxW × maxH. */
export function fitBox(aspect: number, maxW: number, maxH: number) {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const w = Math.min(maxW, maxH * a);
  return { width: Math.round(w), height: Math.round(w / a) };
}

/** Sidebar slots, in px. The tile's padding comes out of the same outer box. */
const SLOTS = {
  md: { mark: 38, markPad: 5, wideW: 184, wideH: 36, tilePadX: 12, tilePadY: 7 },
  sm: { mark: 34, markPad: 4, wideW: 150, wideH: 30, tilePadX: 10, tilePadY: 6 },
};

/**
 * Re-points the colour tokens at a brand, and swaps the tab icon. Rendered
 * with the page, so the first paint is already branded. The root layout draws
 * the platform layer; a company's layer comes later in the page and wins.
 */
export function BrandTheme({ branding }: { branding?: Branding }) {
  const css = branding ? brandCss(branding) : "";
  const favicon = branding?.favicon ? `/api/files/${branding.favicon}` : null;

  useEffect(() => {
    if (!favicon) return;
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
    const before = links.map((l) => ({ l, href: l.href, type: l.type, sizes: l.getAttribute("sizes") }));
    let added: HTMLLinkElement | null = null;
    if (links.length === 0) {
      added = document.createElement("link");
      added.rel = "icon";
      document.head.appendChild(added);
      links.push(added);
    }
    for (const l of links) {
      l.href = favicon;
      l.type = "image/png";
      l.removeAttribute("sizes");
    }
    return () => {
      for (const { l, href, type, sizes } of before) {
        l.href = href;
        l.type = type;
        if (sizes) l.setAttribute("sizes", sizes);
      }
      added?.remove();
    };
  }, [favicon]);

  if (!css) return null;
  return <style data-brand="">{css}</style>;
}

/**
 * The square mark for the collapsed sidebar: a square-ish logo as is, a wide
 * one swaps for the tab icon (or a monogram), and no logo means the Zoa mark.
 */
export function BrandMini({ branding, name, railHex }: { branding?: Branding; name: string; railHex?: string }) {
  if (!branding?.logo) return <BrandMark />;
  const aspect = branding.logoAspect ?? 1;
  const rail = railHex ?? brandTokens(branding)?.light["--rail"] ?? DEFAULT_RAIL;

  if (aspect < WORDMARK_ASPECT) {
    const tiled = logoNeedsTile(branding, rail);
    const inner = tiled ? 28 : 38;
    const box = fitBox(aspect, inner, inner);
    return (
      <span className={`co-logo mark-box${tiled ? " tiled" : ""}`} style={{ width: 38, height: 38, padding: tiled ? 5 : 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
        <img src={`/api/files/${branding.logo}`} alt="" width={box.width} height={box.height} draggable={false} />
      </span>
    );
  }

  if (branding.favicon) {
    return (
      <span className="co-logo mark-box" style={{ width: 38, height: 38 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
        <img src={`/api/files/${branding.favicon}`} alt="" width={38} height={38} draggable={false} />
      </span>
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return <span className="brand-monogram">{initials}</span>;
}

/**
 * The company's logo, fitted to the sidebar. Square-ish marks sit in a fixed
 * tile beside the name; wide wordmarks take the header row on their own. The
 * image gets exact pixel dimensions from its aspect ratio, so it can neither
 * spill out of its slot nor stretch.
 */
export function CompanyLogo({
  branding,
  name,
  railHex,
  src: srcOverride,
  size = "md",
  fallbackTagline,
}: {
  branding: Branding;
  name: string;
  /** Shown under the name when the brand hasn't set a tagline of its own. */
  fallbackTagline: string;
  /** A local preview URL, before the logo is uploaded. */
  src?: string;
  /** The sidebar colour it will sit on, for the legibility check. */
  railHex?: string;
  size?: keyof typeof SLOTS;
}) {
  const slot = SLOTS[size];
  const rail = railHex ?? brandTokens(branding)?.light["--rail"] ?? DEFAULT_RAIL;
  const tiled = logoNeedsTile(branding, rail);
  const src = srcOverride ?? `/api/files/${branding.logo}`;
  const aspect = branding.logoAspect ?? 1;
  const tagline = branding.tagline ?? fallbackTagline;

  if (aspect >= WORDMARK_ASPECT) {
    // A tiled wordmark's tile is a little taller than the bare slot, padding included.
    const box = tiled
      ? fitBox(aspect, slot.wideW - 2 * slot.tilePadX, slot.wideH + 6 - 2 * slot.tilePadY)
      : fitBox(aspect, slot.wideW, slot.wideH);
    return (
      <div className="co-wordmark">
        <span
          className={`co-logo wide${tiled ? " tiled" : ""}`}
          style={tiled ? { padding: `${slot.tilePadY}px ${slot.tilePadX}px` } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
          <img src={src} alt={name} width={box.width} height={box.height} draggable={false} />
        </span>
        {tagline && <small>{tagline}</small>}
      </div>
    );
  }

  const inner = tiled ? slot.mark - 2 * slot.markPad : slot.mark;
  const box = fitBox(aspect, inner, inner);
  return (
    <>
      <span
        className={`co-logo mark-box${tiled ? " tiled" : ""}`}
        style={{ width: slot.mark, height: slot.mark, padding: tiled ? slot.markPad : 0 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
        <img src={src} alt="" width={box.width} height={box.height} draggable={false} />
      </span>
      <div className="co-logo-text">
        <b>{name}</b>
        {tagline && <small>{tagline}</small>}
      </div>
    </>
  );
}
