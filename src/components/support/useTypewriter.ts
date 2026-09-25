"use client";

import { useEffect, useState } from "react";

export type TypewriterPhase = "typing" | "holding" | "deleting" | "gap";

interface Options {
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
  gapMs?: number;
  enabled?: boolean;
}

/**
 * Types each phrase out, holds it, deletes it and moves to the next, forever.
 * Pauses (keeping the current text) while disabled, and stays blank when the
 * viewer prefers reduced motion.
 */
export function useTypewriter(
  phrases: string[],
  { typeMs = 48, deleteMs = 14, holdMs = 3400, gapMs = 900, enabled = true }: Options = {},
) {
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [phase, setPhase] = useState<TypewriterPhase>("typing");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const phrase = phrases.length ? phrases[index % phrases.length] : "";

  useEffect(() => {
    if (!enabled || reduced || !phrase) return;

    let delay: number;
    let step: () => void;

    if (phase === "typing") {
      if (length < phrase.length) {
        delay = typeMs;
        step = () => setLength((n) => n + 1);
      } else {
        delay = 0;
        step = () => setPhase("holding");
      }
    } else if (phase === "holding") {
      delay = holdMs;
      step = () => setPhase("deleting");
    } else if (phase === "deleting") {
      if (length > 0) {
        delay = deleteMs;
        step = () => setLength((n) => n - 1);
      } else {
        delay = 0;
        step = () => setPhase("gap");
      }
    } else {
      delay = gapMs;
      step = () => {
        setIndex((i) => i + 1);
        setPhase("typing");
      };
    }

    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, reduced, phrase, phase, length, typeMs, deleteMs, holdMs, gapMs]);

  return { text: reduced ? "" : phrase.slice(0, length), phase, index };
}
