// Server-only. Password resets, SMS sign-in codes and staff invitations.
import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { KE_MOBILE, normalisePhone } from "@/lib/clientNumber";
import type { User, UserScope } from "@/lib/auth/types";
import { createUser, findRole, findUserByEmail, findUserByPhone, setPassword } from "./accessStore";
import { platformIdentity } from "./branding";
import { randomToken } from "./crypto";
import { getDb, schema } from "./db";
import { emailLive, sendEmail, sendSms, smsLive } from "./integrations/messaging";
import { hashPassword } from "./password";
import { publicBaseUrl } from "./settings";
import { nowStamp } from "./time";

const t = schema;
const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

/** Codes are stored as an HMAC, never in the clear. */
function digest(code: string) {
  const key = process.env.SESSION_SECRET || "zoa-dev-secret-not-for-production-use-only";
  return createHmac("sha256", key).update(`zoa-code:${code}`).digest("hex");
}

/**
 * Without a connected SMS/email provider nothing can be delivered. Outside
 * production we hand the code back so the demo still works; production never
 * reveals it.
 */
const mayRevealCodes = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_CODES === "1";

/** Stores a one-time secret: a 6-digit code by default, or a given token. */
async function issueCode(
  purpose: string,
  user: User | null,
  target: string,
  opts: { meta?: Record<string, unknown>; secret?: string; ttlMs?: number } = {},
) {
  const db = await getDb();
  const code = opts.secret ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(t.authCodes).values({
    purpose,
    userId: user?.id ?? null,
    target,
    codeHash: digest(code),
    expiresAt: new Date(Date.now() + (opts.ttlMs ?? CODE_TTL_MS)),
    meta: opts.meta ?? {},
  });
  return code;
}

/** Checks a code; burns it on success, counts the attempt on failure. */
async function consumeCode(purpose: string, target: string, code: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(t.authCodes)
    .where(
      and(
        eq(t.authCodes.purpose, purpose),
        eq(t.authCodes.target, target),
        isNull(t.authCodes.usedAt),
        gt(t.authCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(t.authCodes.id))
    .limit(1);
  if (!row) return null;
  if (row.attempts >= MAX_ATTEMPTS) return null;
  if (row.codeHash !== digest(code.trim())) {
    await db.update(t.authCodes).set({ attempts: row.attempts + 1 }).where(eq(t.authCodes.id, row.id));
    return null;
  }
  await db.update(t.authCodes).set({ usedAt: new Date() }).where(eq(t.authCodes.id, row.id));
  return row;
}

const GENERIC = "If an account matches, a code is on its way.";

export interface CodeSent {
  message: string;
  via?: "sms" | "email";
  /** Only when nothing could deliver it, and never in production. */
  demoCode?: string;
}

/* ---------------- password reset ---------------- */

export async function requestReset(identifier: string): Promise<CodeSent> {
  const id = identifier.trim();
  const byPhone = KE_MOBILE.test(id.replace(/\s/g, ""));
  const user = byPhone ? await findUserByPhone(id) : await findUserByEmail(id);
  if (!user || user.suspended) return { message: GENERIC };

  const target = byPhone ? normalisePhone(id) : user.email.toLowerCase();
  const code = await issueCode("reset", user, target);

  if (user.phone && (byPhone || !(await emailLive()))) {
    const res = await sendSms({
      to: user.phone,
      purpose: "reset",
      company: user.scope.companyId ?? null,
      body: `Your ${(await platformIdentity()).name} password reset code is ${code}. It expires in 15 minutes. Ignore this if you didn't ask for it.`,
    });
    const delivered = res.status === "sent";
    return { message: GENERIC, via: "sms", demoCode: !delivered && mayRevealCodes() ? code : undefined };
  }

  const res = await sendEmail({
    to: user.email,
    subject: `Your ${(await platformIdentity()).name} password reset code`,
    text: `Your password reset code is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
  });
  return { message: GENERIC, via: "email", demoCode: res.status !== "sent" && mayRevealCodes() ? code : undefined };
}

export async function resetPassword(identifier: string, code: string, password: string) {
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const id = identifier.trim();
  const byPhone = KE_MOBILE.test(id.replace(/\s/g, ""));
  const user = byPhone ? await findUserByPhone(id) : await findUserByEmail(id);
  const target = byPhone ? normalisePhone(id) : id.toLowerCase();
  const row = user ? await consumeCode("reset", target, code) : null;
  if (!user || !row || row.userId !== user.id) return { ok: false, error: "That code is wrong or has expired." };
  await setPassword(user.id, hashPassword(password));
  return { ok: true, user };
}

/* ---------------- sign in with a phone code ---------------- */

export async function requestOtp(phone: string): Promise<CodeSent> {
  if (!KE_MOBILE.test(phone.replace(/\s/g, ""))) return { message: "Enter a Kenyan mobile number like 0712 345 678." };
  const user = await findUserByPhone(phone);
  if (!user || user.suspended) return { message: GENERIC };
  const target = normalisePhone(phone);
  const code = await issueCode("otp", user, target);
  const res = await sendSms({
    to: target,
    purpose: "otp",
    company: user.scope.companyId ?? null,
    body: `Your Zoa sign-in code is ${code}. It expires in 15 minutes.`,
  });
  return {
    message: GENERIC,
    via: "sms",
    demoCode: res.status !== "sent" && mayRevealCodes() ? code : undefined,
  };
}

export async function verifyOtp(phone: string, code: string) {
  const user = await findUserByPhone(phone);
  const row = user ? await consumeCode("otp", normalisePhone(phone), code) : null;
  if (!user || !row || row.userId !== user.id) return null;
  return user;
}

/* ---------------- staff invitations ---------------- */

export interface InviteInput {
  email: string;
  name: string;
  roleId: string;
  phone?: string;
  scope: UserScope;
}

export async function createInvite(input: InviteInput, invitedBy: string) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter a valid email address." };
  if (!input.name.trim()) return { ok: false as const, error: "Enter the person's name." };
  if (await findUserByEmail(email)) return { ok: false as const, error: "Someone already has that email." };
  if (!(await findRole(input.roleId))) return { ok: false as const, error: "Pick a role." };
  if (input.phone && !KE_MOBILE.test(input.phone.replace(/\s/g, ""))) {
    return { ok: false as const, error: "Enter a Kenyan mobile number, or leave it blank." };
  }

  // The link's token is the credential; it is stored only as a digest.
  const token = await issueCode("invite", null, email, {
    secret: randomToken(24),
    ttlMs: 7 * 86_400_000,
    meta: {
      name: input.name.trim(),
      roleId: input.roleId,
      phone: input.phone ? normalisePhone(input.phone) : null,
      scope: input.scope,
      invitedBy,
    },
  });

  const base = (await publicBaseUrl()) ?? "";
  const link = `${base}/login/invite?email=${encodeURIComponent(email)}&token=${token}`;
  const res = await sendEmail({
    to: email,
    subject: "You're invited to Zoa Waste Hub",
    text: `${invitedBy} invited you to Zoa Waste Hub as ${input.name}.\n\nSet your password here (valid for 7 days):\n${link}`,
  });
  return { ok: true as const, emailed: res.status === "sent", link: res.status === "sent" ? undefined : link };
}

export async function acceptInvite(email: string, token: string, password: string) {
  if (password.length < 8) return { ok: false as const, error: "Use at least 8 characters." };
  const row = await consumeCode("invite", email.trim().toLowerCase(), token);
  if (!row) return { ok: false as const, error: "This invitation is invalid or has expired." };
  if (await findUserByEmail(email)) return { ok: false as const, error: "This invitation was already used." };
  const meta = row.meta as { name: string; roleId: string; phone: string | null; scope: UserScope };
  const user = await createUser({
    id: `u-${randomToken(8)}`,
    email: email.trim().toLowerCase(),
    phone: meta.phone,
    name: meta.name,
    roleId: meta.roleId,
    scope: meta.scope ?? {},
    passwordHash: hashPassword(password),
    createdAt: nowStamp(),
  });
  return { ok: true as const, user };
}

export const deliveryStatus = async () => ({ sms: await smsLive(), email: await emailLive() });
