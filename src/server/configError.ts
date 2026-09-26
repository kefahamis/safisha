/**
 * A required setting is missing on the server. The message says which one and
 * how to fix it, and is safe to show: it names the setting, never a value.
 * No imports, so the Edge middleware can use it too.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** What the app can't run without in production, and what each one is for. */
export function missingSettings(): { name: string; effect: string }[] {
  if (process.env.NODE_ENV !== "production") return [];
  const missing: { name: string; effect: string }[] = [];
  if (!process.env.SESSION_SECRET) missing.push({ name: "SESSION_SECRET", effect: "nobody can sign in" });
  if (!process.env.CRON_SECRET) missing.push({ name: "CRON_SECRET", effect: "billing and nightly maintenance don't run" });
  return missing;
}
