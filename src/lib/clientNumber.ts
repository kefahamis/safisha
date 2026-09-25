import { pad } from "./format";

/**
 * Client numbers look like TS-KIL-01427:
 *   TS    company code
 *   KIL   estate code
 *   0142  sequence
 *   7     Luhn check digit, so Paybill can reject mistyped account numbers
 */

export function luhn(num: string): number {
  let sum = 0;
  let dbl = true;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10;
}

/** Issues the next number for a company+estate pair, advancing `seq` in place. */
export function nextClientNumber(
  seq: Record<string, number>,
  company: string,
  estate: string,
  rand: () => number,
): string {
  const key = company + estate;
  seq[key] = (seq[key] ?? 100 + Math.floor(rand() * 300)) + 1;
  const n = pad(seq[key], 4);
  return `${company}-${estate}-${n}${luhn(n)}`;
}

export type ParsedClientNumber =
  | { ok: true; id: string; co: string }
  | { ok: false; reason: string };

export function parseClientNumber(raw: string): ParsedClientNumber {
  const s = String(raw).toUpperCase().replace(/\s/g, "");
  const m = s.match(/^([A-Z]{2})-?([A-Z]{3})-?(\d{4})(\d)$/);
  if (!m) return { ok: false, reason: "Wrong format. Expected e.g. TS-KIL-01427" };
  if (luhn(m[3]) !== +m[4])
    return { ok: false, reason: "Check digit does not match (likely a typo)" };
  return { ok: true, id: `${m[1]}-${m[2]}-${m[3]}${m[4]}`, co: m[1] };
}

const RECEIPT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/** M-Pesa style receipt: a leading letter plus nine unambiguous characters. */
export function receiptNumber(rand: () => number = Math.random): string {
  let s = "U";
  for (let i = 0; i < 9; i++) {
    s += RECEIPT_ALPHABET[Math.floor(rand() * RECEIPT_ALPHABET.length)];
  }
  return s;
}

export const KE_MOBILE = /^(?:\+?254|0)(7|1)\d{8}$/;

/** "+254712345678" / "0712345678" -> "0712 345 678" */
export function normalisePhone(raw: string): string {
  return raw
    .replace(/\s/g, "")
    .replace(/^(\+?254)/, "0")
    .replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
}
