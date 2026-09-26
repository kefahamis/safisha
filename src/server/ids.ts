// Server-only. Sequential ids (T-1046, WO-1001, TS-KIL-01427) that two requests can't both take.
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import * as t from "./db/schema";

/**
 * The next number in a sequence, in one statement. The row lock on the counter
 * serialises concurrent callers, so each gets its own number; seeding the
 * counter from the table's highest existing id keeps numbering continuous for
 * rows written before the counter existed (and by the demo seed).
 */
export async function nextNumber(db: Db, key: string, table: PgTable, idColumn: string, prefix: string, start: number) {
  const from = prefix.length + 1;
  // The prefix is a constant from our own code, never user input.
  const highest = sql`(select coalesce(max(substring(${sql.identifier(idColumn)} from ${sql.raw(String(from))})::int), ${start}) from ${table} where ${sql.identifier(idColumn)} like ${prefix + "%"})`;
  const [row] = await db
    .insert(t.counters)
    .values({ key, value: sql`${highest} + 1` })
    .onConflictDoUpdate({
      target: t.counters.key,
      set: { value: sql`greatest(${t.counters.value}, ${highest}) + 1` },
    })
    .returning({ value: t.counters.value });
  return Number(row.value);
}

export async function nextPrefixedId(db: Db, table: PgTable, prefix: string, start: number) {
  return `${prefix}${await nextNumber(db, `id:${prefix}`, table, "id", prefix, start)}`;
}

/** A company+estate's next client sequence number; new pairs start at a random point, as before. */
export async function nextClientSeq(db: Db, key: string) {
  const [row] = await db
    .insert(t.clientSeq)
    .values({ key, value: 101 + Math.floor(Math.random() * 300) })
    .onConflictDoUpdate({ target: t.clientSeq.key, set: { value: sql`${t.clientSeq.value} + 1` } })
    .returning({ value: t.clientSeq.value });
  return row.value;
}
