import { z } from 'zod';

/**
 * Environment variable schema validation
 * Validates all required and optional environment variables on startup
 */
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').default('4000'),
  HOST: z.string().ip().or(z.literal('0.0.0.0')).or(z.literal('localhost')).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // CORS Configuration
  CORS_ORIGIN: z.string().optional(),

  // RPC URLs - Target Chains (Required)
  RPC_BASE: z.string().url('RPC_BASE must be a valid URL'),
  RPC_ARBITRUM: z.string().url('RPC_ARBITRUM must be a valid URL'),
  RPC_OPTIMISM: z.string().url('RPC_OPTIMISM must be a valid URL').optional(),

  // RPC URLs - Source Chains (Required)
  RPC_BLAST: z.string().url('RPC_BLAST must be a valid URL'),
  RPC_MODE: z.string().url('RPC_MODE must be a valid URL').optional(),
  RPC_ZORA: z.string().url('RPC_ZORA must be a valid URL').optional(),
  RPC_LINEA: z.string().url('RPC_LINEA must be a valid URL').optional(),
  RPC_ZKSYNC: z.string().url('RPC_ZKSYNC must be a valid URL').optional(),
  RPC_SCROLL: z.string().url('RPC_SCROLL must be a valid URL').optional(),

  // Bridge Provider API Keys (Optional but recommended for production)
  SOCKET_API_KEY: z.string().min(10, 'SOCKET_API_KEY must be at least 10 characters').optional(),
  LIFI_API_KEY: z.string().min(10, 'LIFI_API_KEY must be at least 10 characters').optional(),
  LIFI_BASE_URL: z.string().url().optional(),

  // DEX Aggregator API (Optional)
  ODOS_BASE_URL: z.string().url().optional(),
  ODOS_API_KEY: z.string().optional(),

  // Price Oracle API Keys (Optional)
  COINGECKO_API_KEY: z.string().optional(),
  COINMARKETCAP_API_KEY: z.string().optional(),

  // Monitoring & Observability (Optional)
  SENTRY_DSN: z.string().url().optional(),

  // Caching (Optional - Production recommended)
  REDIS_URL: z.string().url().optional(),

  // Database (Optional - Future use)
  DATABASE_URL: z.string().url().optional(),
});

/**
 * Validated and typed environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws an error if validation fails
 */
function parseEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:');
      console.error('');

      for (const issue of error.issues) {
        const path = issue.path.join('.');
        console.error(`  • ${path}: ${issue.message}`);
      }

      console.error('');
      console.error('Please check your .env file and ensure all required variables are set correctly.');
      console.error('See .env.example for reference.');

      process.exit(1);
    }

    throw error;
  }
}

/**
 * Validated environment variables - exported for use throughout the app
 */
export const env = parseEnv();

/**
 * Helper to check if we're in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Helper to check if we're in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Helper to check if we're in test
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Log environment validation success
 */
if (!isTest) {
  console.log('✅ Environment variables validated successfully');
  console.log(`📍 Environment: ${env.NODE_ENV}`);
  console.log(`🔌 Server will start on: ${env.HOST}:${env.PORT}`);

  // Warn about missing optional but recommended keys
  if (!env.SOCKET_API_KEY) {
    console.warn('⚠️  SOCKET_API_KEY not set - Socket provider may have rate limits');
  }
  if (!env.LIFI_API_KEY) {
    console.warn('⚠️  LIFI_API_KEY not set - LI.FI provider may have rate limits');
  }
  if (isProduction && !env.REDIS_URL) {
    console.warn('⚠️  REDIS_URL not set - Caching disabled (not recommended for production)');
  }
  if (isProduction && !env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not set - Error tracking disabled');
  }
}
