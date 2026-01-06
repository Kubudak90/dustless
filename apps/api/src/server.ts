import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { scanHandler, quoteHandler, buildHandler } from "./handlers/index.js";
import { checkAllChainsHealth } from "./services/rpcHealth.js";
import type { ServerToClientEvents, ClientToServerEvents } from "./socket.js";

// Initialize providers (registers them in the registry)
import "./providers/index.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    transport: process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  },
});

// CORS origins
const corsOrigins = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000", "http://localhost:3001"];

// Register CORS
await app.register(cors, {
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
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

// Main API endpoints
app.post("/scan", scanHandler);
app.post("/quote", quoteHandler);
app.post("/build", buildHandler);

// Error handler
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);

  // Zod validation errors
  if (error.name === "ZodError") {
    return reply.status(400).send({
      error: "Validation error",
      details: error.issues,
    });
  }

  // Generic error
  return reply.status(error.statusCode ?? 500).send({
    error: error.message ?? "Internal server error",
  });
});

// Start server with Socket.IO
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

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
