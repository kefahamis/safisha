import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/server/session";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoa Waste Hub",
  description:
    "Prototype platform for Nairobi waste collection: client accounts, M-Pesa billing, live fleet tracking and customer care.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved per request so a role change takes effect without signing out.
  const session = await getSession();

  return (
    <html lang={session?.lang === "sw" ? "sw" : "en"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
