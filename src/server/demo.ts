// Server-only. Whether this deployment runs the demo world.

/**
 * Demo mode seeds the sample companies, clients and staff (all sharing a
 * published password), lists those accounts on the sign-in page, and lets
 * payments be simulated when M-Pesa isn't connected.
 *
 * On by default in development so the app works out of the box. In production
 * it's off unless DEMO_DATA=1: a real deployment must never be filled with
 * accounts anyone can sign in to, or accept payments no one made.
 */
export function demoMode(): boolean {
  const flag = process.env.DEMO_DATA;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
