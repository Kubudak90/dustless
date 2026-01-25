import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

/**
 * Socket.IO Events
 */
export interface ServerToClientEvents {
  // Transaction status updates
  "tx:status": (data: TxStatusUpdate) => void;
  // Bridge progress updates
  "bridge:progress": (data: BridgeProgress) => void;
  // Price updates
  "price:update": (data: PriceUpdate) => void;
  // General notifications
  notification: (data: Notification) => void;
}

export interface ClientToServerEvents {
  // Subscribe to transaction updates
  "tx:subscribe": (txHash: string) => void;
  // Unsubscribe from transaction updates
  "tx:unsubscribe": (txHash: string) => void;
  // Subscribe to price updates for chains
  "price:subscribe": (chainIds: number[]) => void;
  // Join a room for user-specific updates
  "user:join": (address: string) => void;
}

export interface TxStatusUpdate {
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  chainId: number;
  confirmations?: number;
  error?: string;
}

export interface BridgeProgress {
  routeId: string;
  step: number;
  totalSteps: number;
  status: "sending" | "bridging" | "receiving" | "completed" | "failed";
  sourceTxHash?: string;
  destTxHash?: string;
  estimatedTimeRemaining?: number;
}

export interface PriceUpdate {
  chainId: number;
  symbol: string;
  priceUsd: number;
  timestamp: number;
}

export interface Notification {
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
}

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Initialize Socket.IO server
 */
export function initSocketIO(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents> {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Handle user joining their personal room
    socket.on("user:join", (address: string) => {
      const room = `user:${address.toLowerCase()}`;
      socket.join(room);
      console.log(`👤 User ${address.slice(0, 8)}... joined room`);
    });

    // Handle transaction subscription
    socket.on("tx:subscribe", (txHash: string) => {
      const room = `tx:${txHash.toLowerCase()}`;
      socket.join(room);
      console.log(`📡 Subscribed to tx: ${txHash.slice(0, 10)}...`);
    });

    // Handle transaction unsubscription
    socket.on("tx:unsubscribe", (txHash: string) => {
      const room = `tx:${txHash.toLowerCase()}`;
      socket.leave(room);
      console.log(`📴 Unsubscribed from tx: ${txHash.slice(0, 10)}...`);
    });

    // Handle price subscription
    socket.on("price:subscribe", (chainIds: number[]) => {
      chainIds.forEach((chainId) => {
        socket.join(`price:${chainId}`);
      });
      console.log(`💰 Subscribed to prices for chains: ${chainIds.join(", ")}`);
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

/**
 * Get Socket.IO instance
 */
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> | null {
  return io;
}

/**
 * Emit transaction status update
 */
export function emitTxStatus(txHash: string, update: TxStatusUpdate): void {
  if (!io) return;
  io.to(`tx:${txHash.toLowerCase()}`).emit("tx:status", update);
}

/**
 * Emit bridge progress update
 */
export function emitBridgeProgress(userAddress: string, progress: BridgeProgress): void {
  if (!io) return;
  io.to(`user:${userAddress.toLowerCase()}`).emit("bridge:progress", progress);
}

/**
 * Emit price update
 */
export function emitPriceUpdate(chainId: number, update: PriceUpdate): void {
  if (!io) return;
  io.to(`price:${chainId}`).emit("price:update", update);
}

/**
 * Send notification to user
 */
export function sendNotification(userAddress: string, notification: Omit<Notification, "timestamp">): void {
  if (!io) return;
  io.to(`user:${userAddress.toLowerCase()}`).emit("notification", {
    ...notification,
    timestamp: Date.now(),
  });
}

