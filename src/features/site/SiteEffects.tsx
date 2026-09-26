"use client";

import { useEffect } from "react";

/**
 * The site's motion, added after load so the page reads fine without it:
 * blocks rise in as they scroll into view, figures count up, service cards
 * catch a spotlight under the cursor, and the nav marks the section in view.
 * Everything stands still for people who ask for reduced motion.
 */
export function SiteEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".site");
    if (!root) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // Scroll reveals. Hidden only once we know the script is here to show them.
    if (!still && "IntersectionObserver" in window) {
      root.classList.add("js-reveal");
      document.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((g) => {
        [...g.children].forEach((c, i) => {
          (c as HTMLElement).dataset.reveal ??= "";
          (c as HTMLElement).style.setProperty("--d", `${i * 90}ms`);
        });
      });
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
      );
      document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    // Figures count up from zero the first time they're seen.
    const counters = document.querySelectorAll<HTMLElement>("[data-count]");
    if (!still && counters.length) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const el = e.target as HTMLElement;
          const to = Number(el.dataset.count);
          const decimals = Number(el.dataset.decimals ?? 0);
          const suffix = el.dataset.suffix ?? "";
          if (!Number.isFinite(to)) continue;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / 1400);
            const eased = 1 - (1 - t) ** 4;
            el.textContent = `${(to * eased).toLocaleString("en-KE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }, { threshold: 0.6 });
      counters.forEach((c) => io.observe(c));
      cleanups.push(() => io.disconnect());
    }

    // A soft spotlight that follows the pointer across the service cards.
    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".s-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    root.addEventListener("pointermove", onMove);
    cleanups.push(() => root.removeEventListener("pointermove", onMove));

    // The nav marks whichever section is in view.
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".s-links a[href^='#']")];
    const sections = links
      .map((a) => document.querySelector<HTMLElement>(a.getAttribute("href")!))
      .filter((s): s is HTMLElement => Boolean(s));
    if (sections.length) {
      const spy = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            for (const a of links) a.toggleAttribute("aria-current", a.getAttribute("href") === `#${e.target.id}`);
          }
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      sections.forEach((s) => spy.observe(s));
      cleanups.push(() => spy.disconnect());
    }

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
