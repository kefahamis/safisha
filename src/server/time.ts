// Server-only. Business time is Nairobi time, whatever zone the server runs in.

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(d: Date) {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** "2026-09-25 10:15" in Nairobi time — the app's domain date format. */
export function nowStamp(d = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "2026-09-25" */
export const today = (d = new Date()) => nowStamp(d).slice(0, 10);

/** "2026-09" */
export const thisMonth = (d = new Date()) => nowStamp(d).slice(0, 7);

/** Daraja's timestamp: "20260925101530", Nairobi time. */
export function darajaTimestamp(d = new Date()): string {
  const p = parts(d);
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}
