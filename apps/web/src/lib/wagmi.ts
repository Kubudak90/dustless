import { http, createConfig } from "wagmi";
import {
  base,
  arbitrum,
  optimism,
  blast,
  linea,
  scroll,
  zkSync,
  mode,
  zora,
  mainnet,
  polygon,
  avalanche,
  bsc,
  mantle,
  gnosis,
  polygonZkEvm,
  celo,
} from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const config = createConfig({
  chains: [
    mainnet,
    base,
    arbitrum,
    optimism,
    blast,
    linea,
    scroll,
    zkSync,
    mode,
    zora,
    polygon,
    avalanche,
    bsc,
    mantle,
    gnosis,
    polygonZkEvm,
    celo,
  ],
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({ appName: "Dustless" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [blast.id]: http(),
    [linea.id]: http(),
    [scroll.id]: http(),
    [zkSync.id]: http(),
    [mode.id]: http(),
    [zora.id]: http(),
    [polygon.id]: http(),
    [avalanche.id]: http(),
    [bsc.id]: http(),
    [mantle.id]: http(),
    [gnosis.id]: http(),
    [polygonZkEvm.id]: http(),
    [celo.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
