/*
 * Customer-care packages a company subscribes to. Basic is the care desk with
 * the AI assistant answering first. Premium adds messages that cost the
 * platform money to send: SMS and email to clients, and clients replying by
 * SMS or email straight into their ticket. Premium is a monthly fee the
 * company owes the platform, like the pickup commission.
 */

export type CarePackage = "basic" | "premium";

export const CARE_PACKAGES: CarePackage[] = ["basic", "premium"];

/** Shillings a month, unless the platform or the company's own rate says otherwise. */
export const DEFAULT_PREMIUM_FEE = 5000;

export const MAX_PREMIUM_FEE = 1_000_000;

export const PACKAGE_INFO: Record<CarePackage, { name: string; tagline: string; features: string[] }> = {
  basic: {
    name: "Basic",
    tagline: "Care in the app, with an assistant that answers first.",
    features: [
      "Care chat and tickets in the client app",
      "AI assistant replies instantly, day and night, and hands over to your team",
      "Clients answered in English, Kiswahili or Sheng",
      "Sign-in codes by SMS",
    ],
  },
  premium: {
    name: "Premium",
    tagline: "Reach clients by SMS and email, and let them reply the same way.",
    features: [
      "Everything in Basic",
      "SMS and email when your team replies or opens a ticket",
      "Clients reply by SMS or email, straight into their ticket",
      "Billing SMS: welcome, invoices, receipts, reminders and pickup alerts",
    ],
  },
};

/**
 * SMS sent to clients on the company's behalf, which only Premium sends.
 * Anything not listed (sign-in and verification codes, test messages) always goes.
 */
export const PREMIUM_SMS_PURPOSES = new Set([
  "welcome",
  "invoice",
  "receipt",
  "reminder",
  "pickup",
  "missed-pickup",
  "care-reply",
  "care-ticket",
]);

export const isCarePackage = (x: unknown): x is CarePackage => x === "basic" || x === "premium";

/** A company's package as its care package page shows it. */
export interface PackageView {
  company: string;
  package: CarePackage;
  premiumSince?: string;
  /** What Premium costs this company a month. */
  fee: number;
  /** The fee is the company's own rate rather than the platform default. */
  customFee: boolean;
  /** Premium charges so far, newest first. */
  charges: { month: string; amount: number }[];
  /** Client SMS held back this month because the company is on Basic. */
  skippedThisMonth: number;
}
