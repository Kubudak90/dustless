"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSocketConnection, useNotifications } from "@/hooks/useSocket";

interface SocketContextValue {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  isConnected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

/**
 * Socket.IO Provider
 * Manages socket connection and listens for notifications
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const { isConnected } = useSocketConnection();
  
  // Auto-listen for notifications and show toasts
  useNotifications();

  return (
    <SocketContext.Provider value={{ isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

