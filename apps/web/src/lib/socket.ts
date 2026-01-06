import { io, Socket } from "socket.io-client";

/**
 * Socket.IO Events (matching server types)
 */
export interface ServerToClientEvents {
  "tx:status": (data: TxStatusUpdate) => void;
  "bridge:progress": (data: BridgeProgress) => void;
  "price:update": (data: PriceUpdate) => void;
  notification: (data: Notification) => void;
}

export interface ClientToServerEvents {
  "tx:subscribe": (txHash: string) => void;
  "tx:unsubscribe": (txHash: string) => void;
  "price:subscribe": (chainIds: number[]) => void;
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

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Socket.IO client instance
 * autoConnect: false - we'll connect manually when needed
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

/**
 * Connect to Socket.IO server
 */
export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

/**
 * Disconnect from Socket.IO server
 */
export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}

/**
 * Join user's personal room for notifications
 */
export function joinUserRoom(address: string): void {
  if (socket.connected) {
    socket.emit("user:join", address);
  }
}

/**
 * Subscribe to transaction updates
 */
export function subscribeTx(txHash: string): void {
  if (socket.connected) {
    socket.emit("tx:subscribe", txHash);
  }
}

/**
 * Unsubscribe from transaction updates
 */
export function unsubscribeTx(txHash: string): void {
  if (socket.connected) {
    socket.emit("tx:unsubscribe", txHash);
  }
}

/**
 * Subscribe to price updates for chains
 */
export function subscribePrices(chainIds: number[]): void {
  if (socket.connected) {
    socket.emit("price:subscribe", chainIds);
  }
}

