"use client";

import { useState, useEffect, type PropsWithChildren, type ReactNode } from "react";

interface ClientOnlyProps {
  fallback?: ReactNode;
}

/**
 * ClientOnly wrapper component
 * Prevents hydration mismatch by only rendering children on the client
 * Useful for components that use browser-only APIs (like LI.FI Widget)
 */
export function ClientOnly({ children, fallback }: PropsWithChildren<ClientOnlyProps>) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback ?? null}</>;
  }

  return <>{children}</>;
}

