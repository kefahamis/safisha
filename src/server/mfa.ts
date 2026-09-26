// Server-only. Two-step sign-in: the platform's policy, each person's methods, and the challenge at sign-in.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import QRCode from "qrcode";
import type { User, Workspace } from "@/lib/auth/types";
import { KE_MOBILE, normalisePhone } from "@/lib/clientNumber";
import {
  AUDIENCES,
  DEFAULT_POLICY,
  MFA_METHODS,
  maskEmail,
  maskPhone,
  REMEMBER_CHOICES,
  type AudiencePolicy,
  type FactorView,
  type MfaMethod,
  type SecurityPolicy,
  type SecurityView,
} from "@/lib/security";
import { findRole, findUserById } from "./accessStore";
import { consumeCode, issueCode, mayRevealCodes } from "./authFlows";
import { platformIdentity } from "./branding";
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb, schema } from "./db";
import { sendEmail, sendSms } from "./integrations/messaging";
import { signPurpose, verifyPurpose } from "./jwt";
import { HttpError } from "./session";
import { nowStamp } from "./time";

const t = schema;

/* ---------------- policy ---------------- */

export async function securityPolicy(): Promise<SecurityPolicy> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(t.settings)
    .where(and(eq(t.settings.scope, "platform"), eq(t.settings.key, "security")));
  const saved = (row?.config ?? {}) as Partial<SecurityPolicy>;
  return Object.fromEntries(
    AUDIENCES.map((a) => [a.key, { ...DEFAULT_POLICY[a.key], ...(saved[a.key] ?? {}) }]),
  ) as SecurityPolicy;
}

export async function saveSecurityPolicy(input: SecurityPolicy, actor: string): Promise<SecurityPolicy> {
  const clean = {} as SecurityPolicy;
  for (const a of AUDIENCES) {
    const p = input[a.key];
    if (!p || !["off", "optional", "required"].includes(p.requirement)) throw new HttpError(400, `Pick a setting for ${a.label}.`);
    const methods = MFA_METHODS.map((m) => m.key).filter((m) => p.methods?.includes(m));
    if (p.requirement !== "off" && !methods.length) throw new HttpError(400, `${a.label} need at least one method, or turn two-step off for them.`);
    if (!REMEMBER_CHOICES.includes(Number(p.rememberDays))) throw new HttpError(400, "Pick how long a device is remembered.");
    clean[a.key] = { requirement: p.requirement, methods, rememberDays: Number(p.rememberDays) };
  }
  const db = await getDb();
  await db
    .insert(t.settings)
    .values({ scope: "platform", key: "security", config: { ...clean }, status: "ok", updatedBy: actor })
    .onConflictDoUpdate({
      target: [t.settings.scope, t.settings.key],
      set: { config: { ...clean }, updatedAt: new Date(), updatedBy: actor },
    });
  return clean;
}

export async function policyFor(ws: Workspace): Promise<AudiencePolicy> {
  return (await securityPolicy())[ws];
}

/* ---------------- factors ---------------- */

type FactorRow = typeof t.userFactors.$inferSelect;

async function verifiedFactors(userId: string): Promise<FactorRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(t.userFactors)
    .where(and(eq(t.userFactors.user, userId), isNotNull(t.userFactors.verifiedAt)))
    .orderBy(t.userFactors.id);
}

/** Factors that still count under the policy: a method the admin has since withdrawn doesn't. */
async function usableFactors(user: Pick<User, "id">, policy: AudiencePolicy) {
  return (await verifiedFactors(user.id)).filter((f) => policy.methods.includes(f.method as MfaMethod));
}

const toView = (f: FactorRow): FactorView => ({
  id: f.id,
  method: f.method as MfaMethod,
  label: f.label,
  detail: f.detail,
  createdAt: f.createdAt,
  lastUsedAt: f.lastUsedAt ?? undefined,
});

async function workspaceOf(user: User): Promise<Workspace> {
  const role = await findRole(user.roleId);
  if (!role) throw new HttpError(403, "This account has no valid role.");
  return role.workspace;
}

export async function securityView(user: User): Promise<SecurityView> {
  const ws = await workspaceOf(user);
  const policy = await policyFor(ws);
  const db = await getDb();
  const [row] = await db.select().from(t.users).where(eq(t.users.id, user.id));
  const factors = await verifiedFactors(user.id);
  const usable = factors.filter((f) => policy.methods.includes(f.method as MfaMethod));
  return {
    audience: ws,
    policy,
    factors: factors.map(toView),
    email: user.email,
    emailVerified: Boolean(row?.emailVerifiedAt),
    phone: user.phone,
    recoveryCodesLeft: row?.recoveryCodes.length ?? 0,
    setupRequired: policy.requirement === "required" && usable.length === 0,
  };
}

/* ---------------- authenticator apps (RFC 6238) ---------------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpAt(secret: Buffer, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Accepts the current 30-second code, or its neighbours for a slow thumb or a drifting clock. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = unbase32(secretB32);
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(totpAt(secret, step + d));
    return timingSafeEqual(want, Buffer.from(clean));
  });
}

/* ---------------- recovery codes ---------------- */

const recoveryDigest = (code: string) =>
  createHash("sha256")
    .update(`zoa-recovery:${process.env.SESSION_SECRET || "dev"}:${code.replace(/[\s-]/g, "").toLowerCase()}`)
    .digest("hex");

/** Ten fresh codes; the old ones stop working. Shown once, stored only as digests. */
export async function newRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  const db = await getDb();
  await db.update(t.users).set({ recoveryCodes: codes.map(recoveryDigest) }).where(eq(t.users.id, userId));
  return codes;
}

async function useRecoveryCode(userId: string, code: string) {
  const db = await getDb();
  const [row] = await db.select().from(t.users).where(eq(t.users.id, userId));
  const digest = recoveryDigest(code);
  if (!row || !row.recoveryCodes.includes(digest)) return false;
  await db
    .update(t.users)
    .set({ recoveryCodes: row.recoveryCodes.filter((d) => d !== digest) })
    .where(eq(t.users.id, userId));
  return true;
}

/* ---------------- passkeys ---------------- */

/** The site as the browser sees it; passkeys are bound to this name. */
async function relyingParty() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const hostname = host.replace(/:\d+$/, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0].trim();
  return { rpID: hostname, origin: `${proto}://${host}`, rpName: (await platformIdentity()).name };
}

const CHALLENGE_COOKIE = "zoa_webauthn";

async function rememberChallenge(challenge: string, purpose: "register" | "signin", sub: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, await signPurpose("webauthn", { challenge, purpose, sub }, 300), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
  });
}

async function takeChallenge(purpose: "register" | "signin", sub: string) {
  const jar = await cookies();
  const data = await verifyPurpose<{ challenge: string; purpose: string; sub: string }>("webauthn", jar.get(CHALLENGE_COOKIE)?.value);
  jar.delete(CHALLENGE_COOKIE);
  if (!data || data.purpose !== purpose || data.sub !== sub) throw new HttpError(400, "That passkey request expired. Try again.");
  return data.challenge;
}

/* ---------------- setting up a method ---------------- */

/** Codes sent while setting up SMS or email; the demo shows them when nothing can deliver. */
async function sendSetupCode(user: User, method: "sms" | "email", target: string) {
  const purpose = `verify-${method}`;
  const code = await issueCode(purpose, user, target);
  const name = (await platformIdentity()).name;
  if (method === "sms") {
    const res = await sendSms({ to: target, company: user.scope.companyId ?? null, purpose: "verify", body: `${name}: your verification code is ${code}. It expires in 15 minutes.` });
    return { sentTo: maskPhone(target), demoCode: res.status !== "sent" && mayRevealCodes() ? code : undefined };
  }
  const res = await sendEmail({ to: target, subject: `Your ${name} verification code`, text: `Your verification code is ${code}. It expires in 15 minutes.` });
  return { sentTo: maskEmail(target), demoCode: res.status !== "sent" && mayRevealCodes() ? code : undefined };
}

export interface SetupResult {
  ok: true;
  /** Shown once, when the first method is turned on. */
  recoveryCodes?: string[];
  /** The session was waiting on setup; it's been reissued without the hold. */
  unlocked?: boolean;
}

async function allowed(user: User, method: MfaMethod) {
  const policy = await policyFor(await workspaceOf(user));
  if (policy.requirement === "off") throw new HttpError(400, "Two-step sign-in is turned off for your account type.");
  if (!policy.methods.includes(method)) throw new HttpError(400, "That method isn't available for your account type.");
  return policy;
}

/** After a method is confirmed: recovery codes the first time, and lift any setup hold. */
async function afterEnable(user: User): Promise<SetupResult> {
  const db = await getDb();
  const [row] = await db.select().from(t.users).where(eq(t.users.id, user.id));
  const recoveryCodes = row && row.recoveryCodes.length === 0 ? await newRecoveryCodes(user.id) : undefined;
  return { ok: true, recoveryCodes };
}

export async function startSms(user: User, phone: string) {
  await allowed(user, "sms");
  if (!KE_MOBILE.test(phone.replace(/\s/g, ""))) throw new HttpError(400, "Enter a Kenyan mobile number like 0712 345 678.");
  return sendSetupCode(user, "sms", normalisePhone(phone));
}

export async function confirmSms(user: User, phone: string, code: string) {
  await allowed(user, "sms");
  const target = normalisePhone(phone);
  if (!(await consumeCode("verify-sms", target, code))) throw new HttpError(400, "That code is wrong or has expired.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(t.users).set({ phone: target }).where(eq(t.users.id, user.id));
    await tx.delete(t.userFactors).where(and(eq(t.userFactors.user, user.id), eq(t.userFactors.method, "sms")));
    await tx.insert(t.userFactors).values({ user: user.id, method: "sms", label: "SMS code", detail: maskPhone(target), verifiedAt: nowStamp(), createdAt: nowStamp() });
  });
  return afterEnable(user);
}

export async function startEmail(user: User) {
  await allowed(user, "email");
  return sendSetupCode(user, "email", user.email.toLowerCase());
}

export async function confirmEmail(user: User, code: string) {
  await allowed(user, "email");
  if (!(await consumeCode("verify-email", user.email.toLowerCase(), code))) throw new HttpError(400, "That code is wrong or has expired.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(t.users).set({ emailVerifiedAt: nowStamp() }).where(eq(t.users.id, user.id));
    await tx.delete(t.userFactors).where(and(eq(t.userFactors.user, user.id), eq(t.userFactors.method, "email")));
    await tx.insert(t.userFactors).values({ user: user.id, method: "email", label: "Email code", detail: maskEmail(user.email), verifiedAt: nowStamp(), createdAt: nowStamp() });
  });
  return afterEnable(user);
}

export async function startTotp(user: User) {
  await allowed(user, "totp");
  const secret = base32(randomBytes(20));
  const db = await getDb();
  // Only one pending setup at a time; an unconfirmed secret never counts.
  await db
    .delete(t.userFactors)
    .where(and(eq(t.userFactors.user, user.id), eq(t.userFactors.method, "totp"), isNull(t.userFactors.verifiedAt)));
  const [row] = await db
    .insert(t.userFactors)
    .values({ user: user.id, method: "totp", label: "Authenticator app", detail: "", secret: encryptSecret(secret), createdAt: nowStamp() })
    .returning({ id: t.userFactors.id });
  const issuer = (await platformIdentity()).name;
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${user.email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { id: row.id, secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

export async function confirmTotp(user: User, code: string, label: string) {
  await allowed(user, "totp");
  const db = await getDb();
  const rows = await db.select().from(t.userFactors).where(and(eq(t.userFactors.user, user.id), eq(t.userFactors.method, "totp")));
  const pending = rows.filter((r) => !r.verifiedAt).pop();
  const secret = pending?.secret ? decryptSecret(pending.secret) : null;
  if (!pending || !secret) throw new HttpError(400, "Start the authenticator setup again.");
  if (!verifyTotp(secret, code)) throw new HttpError(400, "That code doesn't match. Check the time on your phone and try the newest code.");
  await db
    .update(t.userFactors)
    .set({ verifiedAt: nowStamp(), label: label.trim().slice(0, 40) || "Authenticator app" })
    .where(eq(t.userFactors.id, pending.id));
  return afterEnable(user);
}

export async function passkeyRegistrationOptions(user: User) {
  await allowed(user, "passkey");
  const { rpID, rpName } = await relyingParty();
  const existing = (await verifiedFactors(user.id)).filter((f) => f.method === "passkey" && f.credentialId);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((f) => ({ id: f.credentialId!, transports: f.transports as AuthenticatorTransport[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await rememberChallenge(options.challenge, "register", user.id);
  return options;
}

export async function registerPasskey(user: User, response: RegistrationResponseJSON, label: string) {
  await allowed(user, "passkey");
  const { rpID, origin } = await relyingParty();
  const expectedChallenge = await takeChallenge("register", user.id);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? `That passkey couldn't be saved: ${err.message}` : "That passkey couldn't be saved.");
  }
  if (!verification.verified || !verification.registrationInfo) throw new HttpError(400, "That passkey couldn't be verified.");
  const { credential } = verification.registrationInfo;
  const db = await getDb();
  await db.insert(t.userFactors).values({
    user: user.id,
    method: "passkey",
    label: label.trim().slice(0, 40) || "Passkey",
    detail: "This device",
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    verifiedAt: nowStamp(),
    createdAt: nowStamp(),
  });
  return afterEnable(user);
}

export async function removeFactor(user: User, id: number) {
  const db = await getDb();
  const [f] = await db.select().from(t.userFactors).where(eq(t.userFactors.id, id));
  if (!f || f.user !== user.id) throw new HttpError(404, "No such sign-in method.");
  const policy = await policyFor(await workspaceOf(user));
  const usable = await usableFactors(user, policy);
  if (policy.requirement === "required" && usable.length === 1 && usable[0].id === id) {
    throw new HttpError(400, "Two-step sign-in is required for your account. Add another method before removing this one.");
  }
  await db.delete(t.userFactors).where(eq(t.userFactors.id, id));
  // With nothing left, spare recovery codes mean nothing.
  if ((await verifiedFactors(user.id)).length === 0) await db.update(t.users).set({ recoveryCodes: [] }).where(eq(t.users.id, user.id));
}

/** Platform admin: for someone locked out of every method. */
export async function resetFactors(userId: string) {
  const db = await getDb();
  await db.delete(t.userFactors).where(eq(t.userFactors.user, userId));
  await db.update(t.users).set({ recoveryCodes: [] }).where(eq(t.users.id, userId));
}

/* ---------------- at sign-in ---------------- */

const PENDING_COOKIE = "zoa_mfa";
const TRUST_COOKIE = "zoa_trust";
const PENDING_TTL = 10 * 60;

const cookieBase = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

/**
 * Decides what a correct password (or phone code) leads to: straight in, a
 * second step first, or in but held until a method is set up.
 */
export async function signInGate(user: User, ws: Workspace): Promise<"session" | "challenge" | "setup"> {
  const policy = await policyFor(ws);
  if (policy.requirement === "off") return "session";
  const usable = await usableFactors(user, policy);
  if (!usable.length) return policy.requirement === "required" ? "setup" : "session";

  const jar = await cookies();
  const trust = await verifyPurpose<{ sub: string }>("trust", jar.get(TRUST_COOKIE)?.value);
  if (policy.rememberDays > 0 && trust?.sub === user.id) return "session";

  jar.set(PENDING_COOKIE, await signPurpose("mfa", { sub: user.id }, PENDING_TTL), { ...cookieBase, maxAge: PENDING_TTL });
  return "challenge";
}

/** The person halfway through signing in, from the pending cookie. */
export async function pendingUser(): Promise<User> {
  const jar = await cookies();
  const data = await verifyPurpose<{ sub: string }>("mfa", jar.get(PENDING_COOKIE)?.value);
  const user = data ? await findUserById(data.sub) : undefined;
  if (!user || user.suspended) throw new HttpError(401, "Your sign-in timed out. Enter your password again.");
  return user;
}

export async function challengeView(user: User) {
  const ws = await workspaceOf(user);
  const policy = await policyFor(ws);
  const factors = await usableFactors(user, policy);
  const db = await getDb();
  const [row] = await db.select().from(t.users).where(eq(t.users.id, user.id));
  return {
    name: user.name.split(" ")[0],
    methods: [...new Set(factors.map((f) => f.method as MfaMethod))].map((m) => ({
      method: m,
      detail: factors.find((f) => f.method === m)?.detail ?? "",
    })),
    recovery: (row?.recoveryCodes.length ?? 0) > 0,
    rememberDays: policy.rememberDays,
  };
}

/** Sends the sign-in code for SMS or email. */
export async function sendChallengeCode(user: User, method: "sms" | "email") {
  const factor = (await verifiedFactors(user.id)).find((f) => f.method === method);
  if (!factor) throw new HttpError(400, "That method isn't set up.");
  const target = method === "sms" ? user.phone : user.email.toLowerCase();
  if (!target) throw new HttpError(400, "There's no phone number on your account.");
  const code = await issueCode(`mfa-${method}`, user, method === "sms" ? normalisePhone(target) : target, { ttlMs: 10 * 60_000 });
  const name = (await platformIdentity()).name;
  const res =
    method === "sms"
      ? await sendSms({ to: target, company: user.scope.companyId ?? null, purpose: "signin", body: `${name} sign-in code: ${code}. Don't share it; we will never call to ask for it.` })
      : await sendEmail({ to: target, subject: `Your ${name} sign-in code`, text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't try to sign in, change your password.` });
  return { sentTo: factor.detail, demoCode: res.status !== "sent" && mayRevealCodes() ? code : undefined };
}

// A code space of a million needs a lid on guesses: five tries per sign-in window.
const attempts = new Map<string, { n: number; until: number }>();

function countAttempt(userId: string) {
  const now = Date.now();
  const a = attempts.get(userId);
  const current = a && a.until > now ? a : { n: 0, until: now + PENDING_TTL * 1000 };
  current.n++;
  attempts.set(userId, current);
  if (current.n > 5) throw new HttpError(429, "Too many wrong codes. Wait a few minutes, then sign in again.");
}

/** Checks the second step; on success, clears the pending sign-in and remembers the device if asked. */
export async function verifyChallenge(
  user: User,
  input: { method: MfaMethod | "recovery"; code?: string; response?: AuthenticationResponseJSON; remember?: boolean },
): Promise<{ method: string; recoveryLeft?: number }> {
  const ws = await workspaceOf(user);
  const policy = await policyFor(ws);
  const factors = await usableFactors(user, policy);
  const db = await getDb();
  let used: FactorRow | undefined;

  if (input.method === "recovery") {
    countAttempt(user.id);
    if (!(await useRecoveryCode(user.id, input.code ?? ""))) throw new HttpError(400, "That recovery code isn't valid or was already used.");
  } else if (input.method === "sms" || input.method === "email") {
    countAttempt(user.id);
    used = factors.find((f) => f.method === input.method);
    const target = input.method === "sms" ? normalisePhone(user.phone ?? "") : user.email.toLowerCase();
    if (!used || !(await consumeCode(`mfa-${input.method}`, target, input.code ?? ""))) throw new HttpError(400, "That code is wrong or has expired.");
  } else if (input.method === "totp") {
    countAttempt(user.id);
    used = factors.find((f) => f.method === "totp" && f.secret && verifyTotp(decryptSecret(f.secret) ?? "", input.code ?? ""));
    if (!used) throw new HttpError(400, "That code doesn't match. Try the newest code in your app.");
  } else if (input.method === "passkey") {
    const response = input.response;
    used = factors.find((f) => f.method === "passkey" && f.credentialId === response?.id);
    if (!response || !used) throw new HttpError(400, "That passkey isn't registered to your account.");
    const { rpID, origin } = await relyingParty();
    const expectedChallenge = await takeChallenge("signin", user.id);
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: used.credentialId!,
        publicKey: isoBase64URL.toBuffer(used.publicKey!),
        counter: used.counter,
        transports: used.transports as AuthenticatorTransport[],
      },
    }).catch(() => null);
    if (!result?.verified) throw new HttpError(400, "That passkey couldn't be verified.");
    await db.update(t.userFactors).set({ counter: result.authenticationInfo.newCounter }).where(eq(t.userFactors.id, used.id));
  } else {
    throw new HttpError(400, "Pick a sign-in method.");
  }

  attempts.delete(user.id);
  if (used) await db.update(t.userFactors).set({ lastUsedAt: nowStamp() }).where(eq(t.userFactors.id, used.id));
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
  if (input.remember && policy.rememberDays > 0) {
    const seconds = policy.rememberDays * 86_400;
    jar.set(TRUST_COOKIE, await signPurpose("trust", { sub: user.id }, seconds), { ...cookieBase, maxAge: seconds });
  }
  const [row] = await db.select().from(t.users).where(eq(t.users.id, user.id));
  return { method: input.method, recoveryLeft: input.method === "recovery" ? row?.recoveryCodes.length : undefined };
}

export async function passkeySignInOptions(user: User) {
  const passkeys = (await verifiedFactors(user.id)).filter((f) => f.method === "passkey" && f.credentialId);
  if (!passkeys.length) throw new HttpError(400, "No passkey is set up.");
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((f) => ({ id: f.credentialId!, transports: f.transports as AuthenticatorTransport[] })),
    userVerification: "preferred",
  });
  await rememberChallenge(options.challenge, "signin", user.id);
  return options;
}

/** Forget this browser as a trusted device. */
export async function forgetDevice() {
  (await cookies()).delete(TRUST_COOKIE);
}
