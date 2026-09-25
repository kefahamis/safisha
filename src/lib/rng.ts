/**
 * mulberry32 — a small deterministic PRNG. The demo dataset is generated from a
 * fixed seed so the server render and the first client render agree exactly.
 */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 20260925;

export const pickFrom = <T,>(list: T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)];
