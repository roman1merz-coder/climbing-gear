/**
 * Sentry error monitoring — opt-in via environment variable.
 *
 * To activate:
 * 1. Create a free Sentry project at https://sentry.io
 * 2. Add VITE_SENTRY_DSN to your Vercel env vars
 * 3. Redeploy — errors will start flowing automatically
 *
 * When no DSN is set, this module is a no-op (zero runtime cost).
 */
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE, // "production" or "development"
    // Only sample 20% of transactions to stay within free tier
    tracesSampleRate: 0.2,
    // Don't send errors during local dev by default
    enabled: import.meta.env.PROD,
    // Filter out noisy browser extension errors
    beforeSend(event) {
      const msg = event?.exception?.values?.[0]?.value || "";
      if (/extensions|chrome-extension|moz-extension/i.test(msg)) return null;
      return event;
    },
  });
}

/**
 * React error boundary wrapper.
 * Use: <SentryErrorBoundary fallback={<p>Something went wrong</p>}>
 */
export const SentryErrorBoundary = DSN
  ? Sentry.ErrorBoundary
  : ({ children }) => children;
