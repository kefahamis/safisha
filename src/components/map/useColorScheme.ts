"use client";

import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

/**
 * The theme actually in effect: an explicit `data-theme` on <html> wins,
 * otherwise the OS preference. Used to pick the matching basemap tiles.
 */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const resolve = () => {
      const forced = document.documentElement.getAttribute("data-theme");
      if (forced === "dark" || forced === "light") {
        setScheme(forced);
        return;
      }
      setScheme(media.matches ? "dark" : "light");
    };

    resolve();
    media.addEventListener("change", resolve);

    // The theme attribute can be flipped at runtime; follow it.
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      media.removeEventListener("change", resolve);
      observer.disconnect();
    };
  }, []);

  return scheme;
}
