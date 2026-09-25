export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const pad = (n: number | string, len = 2) => String(n).padStart(len, "0");

/**
 * Thousands separators without Intl. Locale data can differ between the Node
 * build and the browser, which would show up as a hydration mismatch.
 */
export function group(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const kes = (n: number) => `KES ${group(n)}`;

/** "2026-09-25 10:15" -> "25 Sep 2026 · 10:15" */
export function fmtDate(value: string): string {
  const [date, time] = value.split(" ");
  const [y, m, d] = date.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}${time ? ` · ${time}` : ""}`;
}

/** Date -> "2026-09-25 10:15" */
export function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
