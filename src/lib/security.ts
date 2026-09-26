/*
 * Two-step sign-in. Each person turns on the methods they want; the platform
 * admin decides, per kind of account, which methods are offered and whether a
 * second step is off, optional or required.
 */

import type { Workspace } from "./auth/types";

export type MfaMethod = "sms" | "totp" | "passkey" | "email";

export const MFA_METHODS: { key: MfaMethod; label: string; detail: string }[] = [
  { key: "passkey", label: "Passkey", detail: "Fingerprint, face or screen lock on this device. Nothing to type." },
  { key: "totp", label: "Authenticator app", detail: "A 6-digit code from Google Authenticator, Microsoft Authenticator or similar." },
  { key: "sms", label: "SMS code", detail: "A 6-digit code texted to your phone." },
  { key: "email", label: "Email code", detail: "A 6-digit code sent to your verified email address." },
];

export const methodLabel = (m: string) =>
  m === "recovery" ? "Recovery code" : (MFA_METHODS.find((x) => x.key === m)?.label ?? m);

/** Who a policy applies to. Company admins and staff share one. */
export type Audience = "client" | "collector" | "company" | "admin";

export const AUDIENCES: { key: Audience; label: string; detail: string }[] = [
  { key: "client", label: "Clients", detail: "Households and businesses signing in to pay and track." },
  { key: "collector", label: "Collectors", detail: "Drivers on shared or personal phones." },
  { key: "company", label: "Company admins & staff", detail: "Everyone working inside a collection company." },
  { key: "admin", label: "Platform admins", detail: "People who run the platform itself." },
];

export const audienceFor = (ws: Workspace): Audience => ws;

export type Requirement = "off" | "optional" | "required";

export interface AudiencePolicy {
  /** Off: no second step at all. Optional: each person chooses. Required: everyone must set one up. */
  requirement: Requirement;
  /** Methods people in this group may turn on. */
  methods: MfaMethod[];
  /** How long "remember this device" skips the second step; 0 turns it off. */
  rememberDays: number;
}

export type SecurityPolicy = Record<Audience, AudiencePolicy>;

export const DEFAULT_POLICY: SecurityPolicy = {
  client: { requirement: "optional", methods: ["passkey", "sms", "email"], rememberDays: 30 },
  collector: { requirement: "optional", methods: ["passkey", "sms"], rememberDays: 30 },
  company: { requirement: "optional", methods: ["passkey", "totp", "sms", "email"], rememberDays: 14 },
  admin: { requirement: "optional", methods: ["passkey", "totp", "sms", "email"], rememberDays: 7 },
};

export const REMEMBER_CHOICES = [0, 1, 7, 14, 30];

/** One way a person can prove it's them, as the security page lists it. */
export interface FactorView {
  id: number;
  method: MfaMethod;
  label: string;
  /** Where it goes: a masked phone or email, or the device name. */
  detail: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface SecurityView {
  audience: Audience;
  policy: AudiencePolicy;
  factors: FactorView[];
  email: string;
  emailVerified: boolean;
  phone?: string;
  recoveryCodesLeft: number;
  /** The policy requires a method and none is set up yet. */
  setupRequired: boolean;
}

export const maskPhone = (p: string) => p.replace(/\s/g, "").replace(/^(\d{4})\d+(\d{3})$/, "$1 ••• $2");

export const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
