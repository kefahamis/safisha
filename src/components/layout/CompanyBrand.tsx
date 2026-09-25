"use client";

import { brandCss, brandTokens, DEFAULT_RAIL, logoNeedsTile, WORDMARK_ASPECT, type Branding } from "@/lib/branding";

/**
 * Re-points the colour tokens at the company's brand. Rendered with the page,
 * so the first paint is already in the company's colours.
 */
export function BrandTheme({ branding }: { branding?: Branding }) {
  const css = branding ? brandCss(branding) : "";
  if (!css) return null;
  return <style data-brand="">{css}</style>;
}

/**
 * The company's logo, fitted to the sidebar. Square-ish marks sit in the
 * 38px tile beside the name; wide wordmarks take the whole row on their own.
 * A light tile goes behind logos that wouldn't read on the sidebar colour.
 */
export function CompanyLogo({
  branding,
  name,
  sub,
  railHex,
  src: srcOverride,
}: {
  branding: Branding;
  name: string;
  sub?: string;
  /** A local preview URL, before the logo is uploaded. */
  src?: string;
  /** The sidebar colour it will sit on, for the legibility check. */
  railHex?: string;
}) {
  const rail = railHex ?? brandTokens(branding)?.light["--rail"] ?? DEFAULT_RAIL;
  const tiled = logoNeedsTile(branding, rail);
  const src = srcOverride ?? `/api/files/${branding.logo}`;
  const wide = (branding.logoAspect ?? 1) >= WORDMARK_ASPECT;

  if (wide) {
    return (
      <span className={`co-logo wide${tiled ? " tiled" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
        <img src={src} alt={name} draggable={false} />
      </span>
    );
  }

  return (
    <>
      <span className={`co-logo mark-box${tiled ? " tiled" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated file, not a static asset */}
        <img src={src} alt="" draggable={false} />
      </span>
      <div className="co-logo-text">
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </div>
    </>
  );
}
