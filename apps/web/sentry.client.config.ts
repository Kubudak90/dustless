import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://26155b21c6a6c603924c6179d95691cc@o4510675765493760.ingest.de.sentry.io/4510675767394384",

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Replay configuration for session replay
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Define tracePropagationTargets to avoid CORS issues
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.dustless\.com/,
    /^https:\/\/api\.dustless\.com/,
  ],

  // Filter out sensitive data
  beforeSend(event) {
    // Remove user IP
    if (event.user) {
      delete event.user.ip_address;
    }

    // Remove sensitive request data
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['authorization'];
      }
    }

    return event;
  },

  // Ignore specific errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'chrome-extension://',
    'moz-extension://',
    // Network errors
    'NetworkError',
    'Failed to fetch',
    'Load failed',
    // Wallet errors that are expected
    'User rejected',
    'User denied',
  ],

  // Only track errors in production by default
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',
});
