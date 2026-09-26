// Server-only. Rate limits kept in the database, so every server instance counts together.
import { eq, sql } from "drizzle-orm";
import { normalisePhone } from "@/lib/clientNumber";
import { requestIp } from "./audit";
import { getDb } from "./db";
import * as t from "./db/schema";
import { HttpError } from "./session";

export interface Limit {
  /** How many hits the window allows. */
  max: number;
  /** The window's length, from its first hit. */
  windowSec: number;
}

/** Sign-in failures: per account, then per address so one machine can't sweep many accounts. */
export const LOGIN_PER_ACCOUNT: Limit = { max: 8, windowSec: 15 * 60 };
export const LOGIN_PER_IP: Limit = { max: 40, windowSec: 15 * 60 };
/** One-time codes sent to a phone or inbox: each costs an SMS and opens five more guesses. */
export const CODES_PER_TARGET: Limit = { max: 5, windowSec: 60 * 60 };
export const CODES_PER_IP: Limit = { max: 20, windowSec: 60 * 60 };
/** Wrong second-step answers per person. */
export const SECOND_STEP: Limit = { max: 6, windowSec: 10 * 60 };

/** Counts a hit and returns the new total and when the window ends. */
export async function hit(key: string, limit: Limit): Promise<{ hits: number; resetAt: Date }> {
  const db = await getDb();
  const resetAt = new Date(Date.now() + limit.windowSec * 1000);
  // One statement, so two instances counting at once can't both read the old value.
  const [row] = await db
    .insert(t.rateLimits)
    .values({ key, hits: 1, resetAt })
    .onConflictDoUpdate({
      target: t.rateLimits.key,
      set: {
        hits: sql`case when ${t.rateLimits.resetAt} <= now() then 1 else ${t.rateLimits.hits} + 1 end`,
        resetAt: sql`case when ${t.rateLimits.resetAt} <= now() then excluded.reset_at else ${t.rateLimits.resetAt} end`,
      },
    })
    .returning({ hits: t.rateLimits.hits, resetAt: t.rateLimits.resetAt });
  return row;
}

/** Whether the key has used up its window, without counting. */
export async function isLimited(key: string, limit: Limit): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db.select().from(t.rateLimits).where(eq(t.rateLimits.key, key));
  if (!row || row.resetAt.getTime() <= Date.now() || row.hits < limit.max) return null;
  return row.resetAt;
}

/** Forgets a key, e.g. once someone signs in successfully. */
export async function clearLimit(key: string) {
  const db = await getDb();
  await db.delete(t.rateLimits).where(eq(t.rateLimits.key, key));
}

/** "about 12 minutes", for telling someone how long to wait. */
export function waitText(until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/** Throws a 429 when any of the keys is already over its limit. */
export async function ensureNotLimited(checks: [key: string, limit: Limit][], message: string) {
  for (const [key, limit] of checks) {
    const until = await isLimited(key, limit);
    if (until) throw new HttpError(429, `${message} Try again in ${waitText(until)}.`);
  }
}

/** Counts a hit on each key and throws a 429 once any goes over. */
export async function spend(checks: [key: string, limit: Limit][], message: string) {
  for (const [key, limit] of checks) {
    const { hits, resetAt } = await hit(key, limit);
    if (hits > limit.max) throw new HttpError(429, `${message} Try again in ${waitText(resetAt)}.`);
  }
}

/** Drops expired counters now and then so the table stays small. */
export async function sweepLimits() {
  const db = await getDb();
  await db.delete(t.rateLimits).where(sql`${t.rateLimits.resetAt} < now() - interval '1 day'`);
}

/** One key per person whichever way they type it: phones as 0712 345 678, emails lower-cased. */
export function who(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const compact = id.replace(/[\s-]/g, "");
  return /^(\+?254|0)[17]\d{8}$/.test(compact) ? normalisePhone(compact) : id;
}

/** The caller's address, or a shared bucket when it can't be told. */
export async function ipOf() {
  return (await requestIp()) ?? "unknown";
}

/** The limits on proving who you are with a secret: a password, or a code sent to you. */
export async function signinLimits(identifier: string): Promise<[string, Limit][]> {
  return [
    [`signin:${who(identifier)}`, LOGIN_PER_ACCOUNT],
    [`signin-ip:${await ipOf()}`, LOGIN_PER_IP],
  ];
}

/** The limits on sending someone a code. */
export async function codeLimits(identifier: string): Promise<[string, Limit][]> {
  return [
    [`code:${who(identifier)}`, CODES_PER_TARGET],
    [`code-ip:${await ipOf()}`, CODES_PER_IP],
  ];
}

export const TOO_MANY_TRIES = "Too many attempts.";
export const TOO_MANY_CODES = "Too many codes requested.";
