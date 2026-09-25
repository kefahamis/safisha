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
