import { group } from "@/lib/format";

/** Accounting style: thousands separators, negatives in brackets, zero as a dash. */
export const money = (n: number) => (n === 0 ? "–" : n < 0 ? `(${group(-n)})` : group(n));

/** Empty cells stay empty in a Dr/Cr column. */
export const side = (n: number) => (n ? group(n) : "");

/** A CSV download of the rows as shown. */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
