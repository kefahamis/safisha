import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/monitoring";

/*
 * Error monitoring. With SENTRY_DSN set, every unhandled server error (pages,
 * route handlers, the cron jobs, M-Pesa callbacks) and middleware error is
 * reported to Sentry, which alerts by email or Slack as configured there.
 * Without it nothing is sent anywhere; errors still reach the Vercel logs.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // A sample of requests for performance; every error is sent regardless.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    dataCollection: SENTRY_PRIVACY,
  });
}

export const onRequestError = Sentry.captureRequestError;
