"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import {
  socket,
  connectSocket,
  disconnectSocket,
  joinUserRoom,
  subscribeTx,
  unsubscribeTx,
  subscribePrices,
  type TxStatusUpdate,
  type BridgeProgress,
  type PriceUpdate,
  type Notification,
} from "@/lib/socket";
import { toast } from "sonner";

/**
 * Hook for Socket.IO connection management
 */
export function useSocketConnection() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const { address } = useAccount();

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log("🔌 Socket connected");
      
      // Join user room when connected
      if (address) {
        joinUserRoom(address);
      }
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log("🔌 Socket disconnected");
    }

    function onConnectError(error: Error) {
      console.error("🔌 Socket connection error:", error);
    }

    // Register event listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // Connect on mount
    connectSocket();

    // Cleanup on unmount
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      disconnectSocket();
    };
  }, []);

  // Re-join user room when address changes
  useEffect(() => {
    if (isConnected && address) {
      joinUserRoom(address);
    }
  }, [isConnected, address]);

  return { isConnected };
}

/**
 * Hook for listening to transaction status updates
 */
export function useTxStatus(txHash: string | undefined) {
  const [status, setStatus] = useState<TxStatusUpdate | null>(null);

  useEffect(() => {
    if (!txHash) return;

    const currentTxHash = txHash;
    function onTxStatus(update: TxStatusUpdate) {
      if (update.txHash.toLowerCase() === currentTxHash.toLowerCase()) {
        setStatus(update);
      }
    }

    socket.on("tx:status", onTxStatus);
    subscribeTx(txHash);

    return () => {
      socket.off("tx:status", onTxStatus);
      unsubscribeTx(txHash);
    };
  }, [txHash]);

  return status;
}

/**
 * Hook for listening to bridge progress updates
 */
export function useBridgeProgress() {
  const [progress, setProgress] = useState<BridgeProgress | null>(null);

  useEffect(() => {
    function onBridgeProgress(update: BridgeProgress) {
      setProgress(update);
    }

    socket.on("bridge:progress", onBridgeProgress);

    return () => {
      socket.off("bridge:progress", onBridgeProgress);
    };
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
  }, []);

  return { progress, reset };
}

/**
 * Hook for listening to price updates
 */
export function usePriceUpdates(chainIds: number[]) {
  const [prices, setPrices] = useState<Record<number, PriceUpdate>>({});

  useEffect(() => {
    if (chainIds.length === 0) return;

    function onPriceUpdate(update: PriceUpdate) {
      setPrices((prev) => ({
        ...prev,
        [update.chainId]: update,
      }));
    }

    socket.on("price:update", onPriceUpdate);
    subscribePrices(chainIds);

    return () => {
      socket.off("price:update", onPriceUpdate);
    };
  }, [chainIds.join(",")]);

  return prices;
}

/**
 * Hook for listening to notifications and showing toasts
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    function onNotification(notification: Notification) {
      setNotifications((prev) => [...prev, notification]);

      // Show toast based on notification type
      switch (notification.type) {
        case "success":
          toast.success(notification.title, { description: notification.message });
          break;
        case "error":
          toast.error(notification.title, { description: notification.message });
          break;
        case "warning":
          toast.warning(notification.title, { description: notification.message });
          break;
        default:
          toast.info(notification.title, { description: notification.message });
      }
    }

    socket.on("notification", onNotification);

    return () => {
      socket.off("notification", onNotification);
    };
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, clearNotifications };
}

