import { jwtVerify, SignJWT } from "jose";
import type { SessionClaims, Workspace } from "@/lib/auth/types";

/**
 * HS256 session tokens. `jose` is used rather than a Node-only library because
 * middleware verifies the token on the Edge runtime.
 */

export const SESSION_COOKIE = "zoa_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ISSUER = "zoa";
const AUDIENCE = "zoa-app";

const DEV_SECRET = "zoa-dev-secret-not-for-production-use-only";

function secretKey(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return new TextEncoder().encode(raw || DEV_SECRET);
}

export interface TokenPayload extends SessionClaims {
  /** Dashboards this session may open, resolved from the role at sign-in. */
  allowed: Workspace[];
  /** Signed in, but must set up two-step sign-in before doing anything else. */
  setup?: boolean;
}

export async function signSession(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for anything not currently valid — expired, tampered or foreign. */
export async function verifySession(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    const p = payload as unknown as TokenPayload;
    if (!p.sub || !p.roleId || !p.ws) return null;
    return p;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_SECONDS,
} as const;

/*
 * Short-lived tokens for one purpose each — a sign-in waiting on its second
 * step, a remembered device, a passkey challenge. The purpose is the audience,
 * so one can never be replayed as another (or as a session).
 */

export async function signPurpose(purpose: string, data: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(`zoa-${purpose}`)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyPurpose<T extends Record<string, unknown>>(purpose: string, token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: `zoa-${purpose}`,
      algorithms: ["HS256"],
    });
    return payload as unknown as T;
  } catch {
    return null;
  }
}
