// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isDev = process.env.NODE_ENV === "development";
const enableInDev =
  process.env.ENABLE_SENTRY_IN_DEV === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_SENTRY === "true";
const isEnabled = Boolean(dsn) && (!isDev || enableInDev);

if (isDev && !isEnabled) {
  console.info(
    "[sentry] Disabled in development. Set ENABLE_SENTRY_IN_DEV=true to opt-in."
  );
}

Sentry.init({
  dsn: dsn || undefined,
  enabled: isEnabled,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
