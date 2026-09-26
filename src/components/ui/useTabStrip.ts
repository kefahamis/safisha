"use client";

import { useEffect, useRef } from "react";

/**
 * For a `.tabs` row that scrolls sideways on narrow screens: slides the
 * selected tab to the middle whenever it changes, so the tabs either side of
 * it come into view, and marks which edges have more tabs past them
 * (data-more="start" | "end" | "both") for the fade.
 */
export function useTabStrip<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const mark = () => {
      const start = strip.scrollLeft > 2;
      const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
      if (start || end) strip.dataset.more = start && end ? "both" : start ? "start" : "end";
      else delete strip.dataset.more;
    };
    mark();
    strip.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);
    return () => {
      strip.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
    };
  }, []);

  useEffect(() => {
    const strip = ref.current;
    const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    // Scroll the strip only, never the page.
    const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left, behavior: still ? "auto" : "smooth" });
  }, [active]);

  return ref;
}
