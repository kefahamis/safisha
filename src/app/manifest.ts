import type { MetadataRoute } from "next";

/** Installable app: collectors add it to their home screen and work offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zoa Waste Hub",
    short_name: "Zoa",
    description: "Waste collection for Nairobi: routes, payments and customer care.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f6f4",
    theme_color: "#093c3d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
