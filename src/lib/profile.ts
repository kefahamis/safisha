/** What the Profile page shows and edits: your own account details. */
export interface ProfileView {
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  /** Second steps tied to the email or phone; those can't change while these are on. */
  emailCodesOn: boolean;
  smsCodesOn: boolean;
  createdAt: string;
  lastLoginAt?: string;
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
