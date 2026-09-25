/*
 * The integration catalogue. The settings screens render their forms from these
 * definitions and the server validates against them, so adding a field means
 * adding it here. Fields marked `secret` are encrypted at rest and never sent
 * back to the browser — the form shows only whether one is saved.
 */

export type IntegrationKey = "mpesa" | "reminders" | "pricing" | "sms" | "ussd" | "email" | "ai" | "app";

/** "company" settings live per collection company; "platform" ones once. */
export type IntegrationScope = "company" | "platform";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "secret" | "select" | "number" | "toggle" | "url" | "email";
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  required?: boolean;
  /** Only show when another field has this value. */
  when?: { field: string; is: string };
}

export interface IntegrationDef {
  key: IntegrationKey;
  scope: IntegrationScope;
  title: string;
  provider: string;
  summary: string;
  fields: FieldDef[];
  /** Whether "Test connection" is meaningful. */
  testable: boolean;
  docs?: string;
}

export const AI_MODELS = [
  { value: "claude-opus-5", label: "Claude Opus 5 (recommended)" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, lower cost)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest, lowest cost)" },
];

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "mpesa",
    scope: "company",
    title: "M-Pesa payments",
    provider: "Safaricom Daraja",
    summary:
      "STK Push prompts and Paybill (C2B) confirmations go live as soon as the keys test successfully. Until then payments run in the built-in simulator.",
    testable: true,
    docs: "https://developer.safaricom.co.ke",
    fields: [
      {
        name: "environment",
        label: "Environment",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Sandbox (testing)" },
          { value: "production", label: "Production (real money)" },
        ],
      },
      {
        name: "shortcodeType",
        label: "Collection account",
        type: "select",
        required: true,
        options: [
          { value: "paybill", label: "Paybill" },
          { value: "till", label: "Till (Buy Goods)" },
        ],
      },
      {
        name: "shortcode",
        label: "Business short code",
        type: "text",
        required: true,
        placeholder: "174379",
        help: "Your Paybill number, or for a Till the Head Office / store number.",
      },
      {
        name: "tillNumber",
        label: "Till number",
        type: "text",
        placeholder: "e.g. 5123456",
        when: { field: "shortcodeType", is: "till" },
      },
      { name: "consumerKey", label: "Consumer key", type: "secret", required: true },
      { name: "consumerSecret", label: "Consumer secret", type: "secret", required: true },
      {
        name: "passkey",
        label: "Lipa na M-Pesa Online passkey",
        type: "secret",
        required: true,
        help: "Issued with STK Push access. Sandbox uses Safaricom's published test passkey.",
      },
    ],
  },
  {
    key: "reminders",
    scope: "company",
    title: "Billing reminders",
    provider: "Built in",
    summary:
      "Escalating reminders for clients in arrears: an SMS, then an M-Pesa prompt, then a service warning. Each stage is sent at most once a month.",
    testable: false,
    fields: [
      { name: "enabled", label: "Send reminders automatically", type: "toggle" },
      {
        name: "smsAfterDays",
        label: "SMS reminder after (days overdue)",
        type: "number",
        placeholder: "5",
      },
      {
        name: "stkAfterDays",
        label: "M-Pesa payment prompt after (days overdue)",
        type: "number",
        placeholder: "10",
        help: "Sends an STK Push for the balance; the client just enters their PIN.",
      },
      {
        name: "warnAfterDays",
        label: "Service warning after (days overdue)",
        type: "number",
        placeholder: "20",
      },
      {
        name: "minBalance",
        label: "Ignore balances below (KES)",
        type: "number",
        placeholder: "100",
      },
    ],
  },
  {
    key: "pricing",
    scope: "company",
    title: "On-demand pickup prices",
    provider: "Built in",
    summary: "What clients pay for extra and bulky collections booked in the app or by USSD.",
    testable: false,
    fields: [
      { name: "bulky", label: "Bulky items (furniture, mattresses)", type: "number", placeholder: "1500" },
      { name: "garden", label: "Garden waste", type: "number", placeholder: "800" },
      { name: "rubble", label: "Construction rubble (per trip)", type: "number", placeholder: "3500" },
      { name: "extra", label: "Extra bag collection", type: "number", placeholder: "300" },
      { name: "event", label: "Event clean-up", type: "number", placeholder: "5000" },
    ],
  },
  {
    key: "sms",
    scope: "platform",
    title: "SMS",
    provider: "Africa's Talking",
    summary:
      "Receipts, reminders, sign-in codes and care replies. Until configured, messages are recorded in the outbox but not sent.",
    testable: true,
    docs: "https://account.africastalking.com",
    fields: [
      {
        name: "environment",
        label: "Environment",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Sandbox" },
          { value: "live", label: "Live" },
        ],
      },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "sandbox" },
      { name: "apiKey", label: "API key", type: "secret", required: true },
      {
        name: "senderId",
        label: "Sender ID",
        type: "text",
        placeholder: "ZOAHUB",
        help: "Optional. Must be approved on your Africa's Talking account.",
      },
    ],
  },
  {
    key: "ussd",
    scope: "platform",
    title: "USSD",
    provider: "Africa's Talking",
    summary:
      "Clients without smartphones dial a code to check their balance, pay, book a pickup or report a missed collection.",
    testable: false,
    fields: [
      { name: "enabled", label: "Answer USSD sessions", type: "toggle" },
      {
        name: "serviceCode",
        label: "Service code",
        type: "text",
        placeholder: "*384*1234#",
        help: "The code assigned by Africa's Talking. Point its callback at the URL shown below.",
      },
    ],
  },
  {
    key: "email",
    scope: "platform",
    title: "Email",
    provider: "Resend",
    summary: "Password resets and staff invitations. Until configured, links are shown on screen.",
    testable: true,
    docs: "https://resend.com",
    fields: [
      { name: "apiKey", label: "API key", type: "secret", required: true },
      {
        name: "from",
        label: "From address",
        type: "email",
        required: true,
        placeholder: "Zoa Waste Hub <no-reply@zoahub.co.ke>",
      },
    ],
  },
  {
    key: "ai",
    scope: "platform",
    title: "Chat translation",
    provider: "Anthropic Claude",
    summary:
      "Translates customer-care messages between English, Kiswahili and Sheng, checking slang against the built-in Sheng glossary.",
    testable: true,
    docs: "https://console.anthropic.com",
    fields: [
      { name: "apiKey", label: "Anthropic API key", type: "secret", required: true },
      { name: "model", label: "Model", type: "select", options: AI_MODELS },
    ],
  },
  {
    key: "app",
    scope: "platform",
    title: "Public address",
    provider: "Your deployment",
    summary:
      "The HTTPS address Safaricom and Africa's Talking call back to. Payments can't go live without it.",
    testable: false,
    fields: [
      {
        name: "publicBaseUrl",
        label: "Public base URL",
        type: "url",
        required: true,
        placeholder: "https://app.zoahub.co.ke",
        help: "Must be reachable from the internet over HTTPS.",
      },
    ],
  },
];

export const integrationDef = (key: string) => INTEGRATIONS.find((i) => i.key === key);

/** What the browser is told about one integration: never secret values. */
export interface IntegrationView {
  key: IntegrationKey;
  scope: string;
  config: Record<string, unknown>;
  /** Secret field name -> whether a value is saved (and its last 4 characters). */
  secrets: Record<string, { saved: boolean; hint?: string }>;
  status: "unconfigured" | "ok" | "error";
  statusDetail?: string;
  testedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Addresses to register with the provider, when it calls us. */
  callbacks?: { label: string; url: string }[];
}

export const PICKUP_KINDS = [
  { key: "bulky", label: "Bulky items" },
  { key: "garden", label: "Garden waste" },
  { key: "rubble", label: "Construction rubble" },
  { key: "extra", label: "Extra bag collection" },
  { key: "event", label: "Event clean-up" },
] as const;

export const DEFAULT_PRICES: Record<string, number> = {
  bulky: 1500,
  garden: 800,
  rubble: 3500,
  extra: 300,
  event: 5000,
};

export const DEFAULT_REMINDERS = {
  enabled: false,
  smsAfterDays: 5,
  stkAfterDays: 10,
  warnAfterDays: 20,
  minBalance: 100,
};
