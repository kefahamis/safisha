/**
 * The prototype runs on a frozen demo clock so screenshots and seeded data line
 * up. `elapsedMs` lives in the store and only advances from the client ticker,
 * which keeps the server render and the first client render identical.
 */

/** Friday 25 September 2026, 10:15 — built from local parts, so timezone-stable. */
export const DEMO_START = new Date(2026, 8, 25, 10, 15);

export const TODAY = "2026-09-25";

export const demoNow = (elapsedMs: number) => new Date(DEMO_START.getTime() + elapsedMs);
