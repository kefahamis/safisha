import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/monitoring";

// Browser errors, when NEXT_PUBLIC_SENTRY_DSN is set at build time (see src/instrumentation.ts).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    dataCollection: SENTRY_PRIVACY,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
