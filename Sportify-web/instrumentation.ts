import * as Sentry from "@sentry/nextjs";

// Server-side error monitoring. Does nothing unless SENTRY_DSN is set
// (e.g. in Netlify env vars), so local dev and CI stay quiet.
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

// Reports errors thrown by route handlers and server components.
export const onRequestError = Sentry.captureRequestError;
