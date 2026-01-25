import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env, isProduction, isDevelopment } from './env.js';

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
export function initSentry() {
  // Only initialize if DSN is provided
  if (!env.SENTRY_DSN) {
    console.warn('⚠️  Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,

    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in prod, 100% in dev

    // Profiling
    profilesSampleRate: isProduction ? 0.1 : 1.0,
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Release tracking
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,

    // Don't send errors in development
    enabled: isProduction,

    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['api-key'];
      }

      // Remove query parameters that might contain sensitive data
      if (event.request?.query_string && typeof event.request.query_string === 'string') {
        const sensitiveParams = ['apiKey', 'token', 'secret', 'password'];
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
      'Network request failed',

      // User cancellations
      'AbortError',
      'Request aborted',

      // Rate limiting (expected)
      'RATE_LIMIT_EXCEEDED',

      // Validation errors (not bugs)
      'VALIDATION_ERROR',
    ],
  });

  console.log('✅ Sentry initialized for error tracking');
}

/**
 * Capture exception with context
 */
export function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    level?: Sentry.SeverityLevel;
  }
) {
  if (!env.SENTRY_DSN) return;

  Sentry.withScope(scope => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture message with context
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
) {
  if (!env.SENTRY_DSN) return;

  Sentry.withScope(scope => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    Sentry.captureMessage(message, level);
  });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  category?: string
) {
  if (!env.SENTRY_DSN) return;

  Sentry.addBreadcrumb({
    message,
    data,
    category: category || 'app',
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context
 */
export function setUser(user: {
  id?: string;
  address?: string;
  [key: string]: any;
}) {
  if (!env.SENTRY_DSN) return;

  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser() {
  if (!env.SENTRY_DSN) return;

  Sentry.setUser(null);
}

export { Sentry };
