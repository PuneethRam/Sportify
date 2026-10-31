import * as Sentry from "@sentry/nextjs";

// Browser error monitoring. Inactive unless NEXT_PUBLIC_SENTRY_DSN is set at build time.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
