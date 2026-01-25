import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://26155b21c6a6c603924c6179d95691cc@o4510675765493760.ingest.de.sentry.io/4510675767394384",

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Profiling
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Filter out sensitive data
  beforeSend(event) {
    // Remove sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['authorization'];
      delete event.request.headers['x-api-key'];
    }

    // Remove query parameters that might contain sensitive data
    if (event.request?.query_string && typeof event.request.query_string === 'string') {
      const sensitiveParams = ['apiKey', 'token', 'secret', 'password', 'key'];
      let queryString = event.request.query_string;

      sensitiveParams.forEach(param => {
        if (queryString.includes(param)) {
          queryString = queryString.replace(
            new RegExp(`${param}=[^&]*`, 'g'),
            `${param}=[REDACTED]`
          );
        }
      });

      event.request.query_string = queryString;
    }

    return event;
  },

  // Ignore specific errors
  ignoreErrors: [
    // Network errors
    'NetworkError',
    'ECONNREFUSED',
    'ETIMEDOUT',
    // Next.js errors that are not actionable
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
  ],

  // Only track errors in production by default
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',
});
