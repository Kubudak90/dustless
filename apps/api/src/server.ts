import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import { Server } from "socket.io";
import { env, isDevelopment, isProduction } from "./config/env.js";
import { scanHandler, quoteHandler, buildHandler } from "./handlers/index.js";
import { checkAllChainsHealth } from "./services/rpcHealth.js";
import type { ServerToClientEvents, ClientToServerEvents } from "./socket.js";
import { DustlessError } from "@dustless/shared";

// Initialize providers (registers them in the registry)
import "./providers/index.js";

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: isDevelopment
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  },
});

// CORS origins
const corsOrigins = env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000", "http://localhost:3001"];

// Register CORS
await app.register(cors, {
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
});

// Register Security Headers (Helmet)
await app.register(helmet, {
  // Disable CSP in development for easier debugging
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false,
  // HSTS - Force HTTPS in production
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Disable X-Powered-By header
  hidePoweredBy: true,
});

// Register Response Compression
await app.register(compress, {
  global: true,
  threshold: 1024, // Only compress responses > 1KB
  encodings: ['gzip', 'deflate'],
  // Don't compress already compressed formats
  customTypes: /^text\/|application\/json|application\/javascript/,
});

// Register Rate Limiting
await app.register(rateLimit, {
  global: true,
  max: 100, // 100 requests
  timeWindow: '15 minutes',
  cache: 10000, // Cache up to 10k IPs
  allowList: ['127.0.0.1'], // Localhost for testing
  keyGenerator: (req) => {
    // Use forwarded IP if behind proxy, otherwise use connection IP
    return req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip;
  },
  errorResponseBuilder: (_req, context) => {
    return {
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    };
  },
  skipOnError: false, // Don't skip rate limiting on errors
});

// Health check
app.get("/health", async () => {
  return { ok: true, timestamp: new Date().toISOString() };
});

// RPC health status (for debugging)
app.get("/health/chains", async () => {
  const chains = await checkAllChainsHealth();
  const healthy = chains.filter((c) => c.healthy).length;
  return {
    ok: healthy > 0,
    healthy,
    total: chains.length,
    chains,
  };
});

// Main API endpoints with endpoint-specific rate limits
app.post("/scan", {
  config: {
    rateLimit: {
      max: 10, // 10 scans per minute
      timeWindow: '1 minute',
    }
  }
}, scanHandler);

app.post("/quote", {
  config: {
    rateLimit: {
      max: 20, // 20 quote requests per minute
      timeWindow: '1 minute',
    }
  }
}, quoteHandler);

app.post("/build", {
  config: {
    rateLimit: {
      max: 15, // 15 build requests per minute
      timeWindow: '1 minute',
    }
  }
}, buildHandler);

// Error handler
app.setErrorHandler((error, request, reply) => {
  // Log error (but don't log validation errors at error level)
  if (error.name === "ZodError") {
    app.log.warn({ error, path: request.url }, 'Validation error');
  } else if (error instanceof DustlessError) {
    app.log.warn({ error: error.toJSON(), path: request.url }, 'Application error');
  } else {
    app.log.error({ error, path: request.url }, 'Unexpected error');
  }

  // Zod validation errors
  if (error.name === "ZodError") {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: (error as any).issues,
    });
  }

  // Custom Dustless errors
  if (error instanceof DustlessError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Rate limit errors (from @fastify/rate-limit)
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: "RATE_LIMIT_EXCEEDED",
      message: error.message,
    });
  }

  // Generic error - don't expose internal details in production
  const errorResponse: any = {
    error: isProduction ? "INTERNAL_SERVER_ERROR" : error.message ?? "Internal server error",
  };

  // Include stack trace in development
  if (isDevelopment && error.stack) {
    errorResponse.stack = error.stack;
  }

  return reply.status(error.statusCode ?? 500).send(errorResponse);
});

// Start server with Socket.IO
const port = Number(env.PORT);
const host = env.HOST;

const start = async () => {
  try {
    // Start Fastify first
    await app.listen({ port, host });
    app.log.info(`🚀 Dustless API running at http://${host}:${port}`);

    // Get the underlying HTTP server and attach Socket.IO
    const httpServer = app.server;

    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Socket.IO event handlers
    io.on("connection", (socket) => {
      app.log.info(`🔌 Client connected: ${socket.id}`);

      socket.on("user:join", (address: string) => {
        const room = `user:${address.toLowerCase()}`;
        socket.join(room);
        app.log.info(`👤 User ${address.slice(0, 8)}... joined room`);
      });

      socket.on("tx:subscribe", (txHash: string) => {
        const room = `tx:${txHash.toLowerCase()}`;
        socket.join(room);
        app.log.info(`📡 Subscribed to tx: ${txHash.slice(0, 10)}...`);
      });

      socket.on("tx:unsubscribe", (txHash: string) => {
        const room = `tx:${txHash.toLowerCase()}`;
        socket.leave(room);
      });

      socket.on("price:subscribe", (chainIds: number[]) => {
        chainIds.forEach((chainId) => {
          socket.join(`price:${chainId}`);
        });
      });

      socket.on("disconnect", (reason) => {
        app.log.info(`🔌 Client disconnected: ${socket.id} (${reason})`);
      });
    });

    app.log.info(`🔌 Socket.IO ready for connections`);

    // Store io instance for later use
    (app as any).io = io;

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
const shutdown = async () => {
  app.log.info("Shutting down...");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
