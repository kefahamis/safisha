/*
 * The platform's cut of on-demand pickups. Clients pay the company's own
 * Paybill, so the commission is something the company owes the platform,
 * counted once the client has paid.
 */

/** Percent of each paid pickup, unless a company has its own rate. */
export const DEFAULT_PICKUP_COMMISSION = 10;

/** Rates are whole or fractional percents from 0 to 50. */
export const MAX_PICKUP_COMMISSION = 50;

/** Shillings owed on a pickup of `price` at `rate` percent, rounded to the shilling. */
export const commissionOf = (price: number, rate: number) => Math.round((price * rate) / 100);

/** "10%", "7.5%" */
export const pct = (rate: number) => `${Number(rate.toFixed(2))}%`;
