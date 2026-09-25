"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { identity, type Branding, type Identity } from "@/lib/branding";
import { BrandMark } from "./BrandMark";
import { CompanyLogo } from "./CompanyBrand";

interface PlatformBrand {
  branding: Branding;
  identity: Identity;
}

const Ctx = createContext<PlatformBrand>({ branding: {}, identity: identity() });

/** The platform brand, loaded by the root layout so signed-out pages have it too. */
export function PlatformBrandProvider({ branding, children }: { branding: Branding; children: ReactNode }) {
  const value = useMemo(() => ({ branding, identity: identity(branding) }), [branding]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePlatformBrand = () => useContext(Ctx);

/**
 * The platform's logo and name, wherever "Zoa" used to be: the sidebar for
 * unbranded surfaces, and the sign-in and account pages.
 */
export function PlatformIdentity({ markSize = 38, railHex }: { markSize?: number; railHex?: string }) {
  const { branding, identity: id } = usePlatformBrand();
  if (branding.logo) {
    return <CompanyLogo branding={branding} name={id.name} fallbackTagline={id.tagline} railHex={railHex} />;
  }
  return (
    <>
      <BrandMark size={markSize} />
      <div>
        <b>{id.name}</b>
        {id.tagline && <small>{id.tagline}</small>}
      </div>
    </>
  );
}
