import { registry } from "./BridgeProvider.js";
import { swapRegistry } from "./SwapProvider.js";
import { LiFiProvider } from "./lifi.js";
import { SocketProvider } from "./socket.js";
import { OdosProvider } from "./odos.js";

// Register all bridge providers
registry.register(new LiFiProvider());
registry.register(new SocketProvider());

// Register all swap providers
swapRegistry.register(new OdosProvider());

export { registry, type BridgeProvider } from "./BridgeProvider.js";
export { swapRegistry, type SwapProvider } from "./SwapProvider.js";
export { LiFiProvider } from "./lifi.js";
export { SocketProvider } from "./socket.js";
export { OdosProvider } from "./odos.js";
