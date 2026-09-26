import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BrandTheme } from "@/components/layout/CompanyBrand";
import { identity } from "@/lib/branding";
import { platformBranding } from "@/server/branding";
import { getSession } from "@/server/session";
import { Providers } from "./providers";
import "./globals.css";

const DESCRIPTION =
  "Prototype platform for Nairobi waste collection: client accounts, M-Pesa billing, live fleet tracking and customer care.";

/** Every page title ends in the platform's name, whatever the admin has called it. */
export async function generateMetadata(): Promise<Metadata> {
  const { name, full } = identity(await platformBranding());
  return { title: { default: full, template: `%s · ${name}` }, description: DESCRIPTION };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved per request so a role change takes effect without signing out.
  const session = await getSession();
  const platform = await platformBranding();

  return (
    <html lang={session?.lang === "sw" ? "sw" : "en"} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        {/* The platform look underneath everything; a company's brand layers on top. */}
        <BrandTheme branding={platform} />
        <Providers session={session} platform={platform}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
