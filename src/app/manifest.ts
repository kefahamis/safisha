import type { MetadataRoute } from "next";
import { brandTokens, identity } from "@/lib/branding";
import { platformBranding } from "@/server/branding";

// Follows the platform brand, which the admin can change at any time.
export const dynamic = "force-dynamic";

/** Installable app: collectors add it to their home screen and work offline. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const platform = await platformBranding();
  const { name, full } = identity(platform);
  return {
    name: full,
    short_name: name,
    description: "Waste collection for Nairobi: routes, payments and customer care.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f6f4",
    theme_color: brandTokens(platform)?.light["--rail"] ?? "#093c3d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
