const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dustless/shared"],

  // Sentry configuration
  sentry: {
    // Hides source maps from generated client bundles
    hideSourceMaps: true,
    // Automatically tree-shake Sentry logger statements for production
    disableLogger: true,
  },
};

// Sentry webpack plugin options
const sentryWebpackPluginOptions = {
  // Additional config options for the Sentry Webpack plugin
  silent: true, // Suppresses all logs
  // Upload source maps only in production
  dryRun: process.env.NODE_ENV !== 'production',
  // Disable source map upload if SENTRY_AUTH_TOKEN is not set
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: "kubudak90",
  project: "javascript-nextjs",
};

// Make sure adding Sentry options is the last code to run before exporting
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
