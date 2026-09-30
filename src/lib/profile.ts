export type Theme = "system" | "light" | "dark";

/** Messages a client can turn off outside the app. Missing keys mean on. */
export const CLIENT_NOTICES = [
  { key: "billing", label: "Billing SMS", detail: "Invoices, receipts and payment reminders." },
  { key: "pickups", label: "Collection SMS", detail: "Scheduled pickups and missed collections." },
  { key: "care", label: "Customer care SMS", detail: "When the care team replies or opens a request for you." },
  { key: "careEmail", label: "Customer care email", detail: "The same care replies by email." },
] as const;
export type ClientNotice = (typeof CLIENT_NOTICES)[number]["key"];

/** Which notice an outgoing SMS falls under; null for ones that always go (sign-in codes, welcome). */
export function noticeFor(purpose: string): ClientNotice | null {
  if (purpose === "invoice" || purpose === "receipt" || purpose === "reminder") return "billing";
  if (purpose === "pickup" || purpose === "missed-pickup") return "pickups";
  if (purpose === "care-reply" || purpose === "care-ticket") return "care";
  return null;
}

/** What the Profile page shows and edits: your own account details. */
export interface ProfileView {
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Second steps tied to the email or phone; those can't change while these are on. */
  emailCodesOn: boolean;
  smsCodesOn: boolean;
  createdAt: string;
  lastLoginAt?: string;
  photo?: string;
  lang: "en" | "sw";
  theme: Theme;
  /** Staff: where they land after signing in, and the pages they could choose. */
  startPage?: string;
  startOptions?: { href: string; label: string }[];
  /** Care agents: their reply signature and whether they're away from the desk. */
  agent?: { signature: string; away: boolean };
  /** Clients: which messages they get outside the app, and the number M-Pesa prompts go to. */
  client?: { notify: Record<ClientNotice, boolean>; mpesaPhone: string; contactPhone: string; company: string };
}

/** One sign-in, for the Sign-ins tab. */
export interface SignInRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  device: string;
  method: string;
  current: boolean;
  active: boolean;
}

/** A rough 0–4 score for the strength hint. The server only enforces the minimum length. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  if (pw.length < 8) return { score: 1, label: "Too short" };
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const s = Math.min(score, 4) as 1 | 2 | 3 | 4;
  return { score: s, label: ["", "Weak", "Fair", "Good", "Strong"][s] };
}
