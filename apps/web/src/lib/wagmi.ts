import { http, createConfig } from "wagmi";
import { base, arbitrum, optimism, blast, linea, scroll, zkSync, mode, zora } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const config = createConfig({
  chains: [base, arbitrum, optimism, blast, linea, scroll, zkSync, mode, zora],
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({ appName: "Dustless" }),
  ],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [blast.id]: http(),
    [linea.id]: http(),
    [scroll.id]: http(),
    [zkSync.id]: http(),
    [mode.id]: http(),
    [zora.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
