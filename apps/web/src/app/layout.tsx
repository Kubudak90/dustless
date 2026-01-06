import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Dustless - Recover Stuck Crypto",
  description: "One-click recovery for abandoned chain assets. Consolidate your scattered ETH to Base or Arbitrum.",
  keywords: ["crypto", "bridge", "recovery", "ethereum", "base", "arbitrum", "dust"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-black text-white antialiased min-h-screen">
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "#18181b",
                border: "1px solid #27272a",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
