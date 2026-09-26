import type { BrowserOptions } from "@sentry/nextjs";

/**
 * What error reports may carry: the error, its stack and the route, nothing
 * else. Cookies and headers hold session tokens; request bodies, query
 * results and AI inputs hold phone numbers, M-Pesa payloads and client
 * messages. None of it leaves for Sentry.
 */
export const SENTRY_PRIVACY: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
};
