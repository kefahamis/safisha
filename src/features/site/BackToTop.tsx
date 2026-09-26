"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

const R = 22;
const C = 2 * Math.PI * R;

/**
 * Back to the top, once the hero is behind you. The ring fills as the page
 * scrolls, so it doubles as a quiet "how far down am I".
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setShown(window.scrollY > window.innerHeight * 0.8);
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const top = () => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
    // Keyboard users land at the start of the page, not on a vanished button.
    document.querySelector<HTMLElement>(".s-brand")?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      className={`s-top${shown ? " shown" : ""}`}
      onClick={top}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
    >
      <svg className="s-top-ring" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={R} className="track" />
        <circle cx="26" cy="26" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
