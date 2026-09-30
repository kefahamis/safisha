/*
 * Customer-care packages. The platform admin builds the catalogue: each
 * package is a set of the features below at a monthly price. A company admin
 * subscribes to one; the fee is owed to the platform, like the pickup
 * commission. With no package a company still has the in-app chat with the
 * AI assistant, and its staff can answer from the chat inbox.
 */

export type PackageFeature = "tickets" | "sms" | "email" | "twoWay";

export const PACKAGE_FEATURES: { key: PackageFeature; label: string; detail: string }[] = [
  {
    key: "tickets",
    label: "Tickets desk",
    detail: "Priorities, response deadlines, assignment, internal notes, and opening tickets for phone or walk-in clients.",
  },
  {
    key: "sms",
    label: "SMS to clients",
    detail: "Care replies and new tickets by SMS, plus billing SMS: welcome, invoices, receipts, reminders and pickup alerts.",
  },
  {
    key: "email",
    label: "Email to clients",
    detail: "Care replies and new tickets by email.",
  },
  {
    key: "twoWay",
    label: "Replies by SMS and email",
    detail: "Clients answer by SMS or email and it lands in their ticket.",
  },
];

/** What every company has, package or not. */
export const ALWAYS_INCLUDED = [
  "Care chat in the client app",
  "AI assistant answering first, in English, Kiswahili or Sheng",
  "Staff replies from the chat inbox",
  "Sign-in codes by SMS",
];

export const isPackageFeature = (x: unknown): x is PackageFeature => PACKAGE_FEATURES.some((f) => f.key === x);

export const featureLabel = (key: string) => PACKAGE_FEATURES.find((f) => f.key === key)?.label ?? key;

export const MAX_PACKAGE_PRICE = 1_000_000;

/**
 * SMS sent to clients on the company's behalf, which need the "sms" feature.
 * Anything not listed (sign-in and verification codes, test messages) always goes.
 */
export const PACKAGE_SMS_PURPOSES = new Set([
  "welcome",
  "invoice",
  "receipt",
  "reminder",
  "pickup",
  "missed-pickup",
  "care-reply",
  "care-ticket",
]);

/** A package in the catalogue. */
export interface CarePackageDef {
  id: string;
  name: string;
  description: string;
  price: number;
  features: PackageFeature[];
  active: boolean;
  sort: number;
}

/** A company's subscription, as its Care package page shows it. */
export interface PackageView {
  company: string;
  /** The package it's on, or null for the assistant alone. */
  current: (CarePackageDef & { price: number; customPrice: boolean }) | null;
  since?: string;
  /** Packages it can subscribe or switch to. */
  offered: CarePackageDef[];
  /** Charges so far, newest first. */
  charges: { month: string; amount: number }[];
  /** Client SMS held back this month because no package includes them. */
  skippedThisMonth: number;
}
