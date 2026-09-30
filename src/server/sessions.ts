// Server-only. Each sign-in is a row, so a person can see where they're signed in and sign devices out.
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { randomToken } from "./crypto";
import { getDb, schema as t } from "./db";
import { requestIp } from "./audit";
import type { SignInRow } from "@/lib/profile";

/** lastSeenAt is refreshed at most this often, so reading a page isn't a write every time. */
const TOUCH_EVERY_MS = 5 * 60_000;

/** Starts a session row for a sign-in; its id rides in the token as `sid`. */
export async function startSession(userId: string, method: string, ttlSeconds: number): Promise<string> {
  const db = await getDb();
  const id = `S-${randomToken(16)}`;
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // Outside a request (tests); nothing to record.
  }
  await db.insert(t.sessions).values({
    id,
    user: userId,
    method,
    ip: await requestIp(),
    userAgent,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });
  return id;
}

/**
 * Whether a session is still good: not signed out, not expired. Refreshes
 * its last-seen time now and then.
 */
export async function sessionAlive(id: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ lastSeenAt: t.sessions.lastSeenAt })
    .from(t.sessions)
    .where(and(eq(t.sessions.id, id), eq(t.sessions.user, userId), isNull(t.sessions.revokedAt), gt(t.sessions.expiresAt, new Date())));
  if (!row) return false;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(t.sessions).set({ lastSeenAt: new Date() }).where(eq(t.sessions.id, id));
  }
  return true;
}

export async function revokeSession(id: string, userId: string) {
  const db = await getDb();
  const rows = await db
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.sessions.id, id), eq(t.sessions.user, userId), isNull(t.sessions.revokedAt)))
    .returning({ id: t.sessions.id });
  return rows.length > 0;
}

/** Signs out every other device; `keep` is the session in use, or undefined to sign out all. */
export async function revokeOtherSessions(userId: string, keep?: string) {
  const db = await getDb();
  const rows = await db
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.sessions.user, userId), isNull(t.sessions.revokedAt), keep ? ne(t.sessions.id, keep) : undefined))
    .returning({ id: t.sessions.id });
  return rows.length;
}


/** A readable device from a user-agent string: "Chrome on Android". */
export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl|node|undici/i.test(ua)
              ? "A script"
              : "A browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** The person's recent sign-ins, newest first: the live ones and the last few ended ones. */
export async function listSessions(userId: string, currentId?: string): Promise<SignInRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.sessions)
    .where(and(eq(t.sessions.user, userId), gt(t.sessions.createdAt, sql`now() - interval '90 days'`)))
    .orderBy(desc(t.sessions.createdAt))
    .limit(20);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    ip: r.ip,
    device: describeDevice(r.userAgent),
    method: r.method,
    current: r.id === currentId,
    active: !r.revokedAt && r.expiresAt.getTime() > now,
  }));
}
