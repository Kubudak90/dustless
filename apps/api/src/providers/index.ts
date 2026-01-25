import { registry } from "./BridgeProvider.js";
import { swapRegistry } from "./SwapProvider.js";
import { LiFiProvider } from "./lifi.js";
import { SocketProvider } from "./socket.js";
import { AcrossProvider } from "./across.js";
import { ZoraProvider } from "./zora.js";
import { OdosProvider } from "./odos.js";

// Register all bridge providers
registry.register(new LiFiProvider());
registry.register(new SocketProvider());
registry.register(new AcrossProvider()); // Across Protocol - supports many chains
registry.register(new ZoraProvider()); // Zora native bridge - for Zora to Base

// Register all swap providers
swapRegistry.register(new OdosProvider());

export { registry, type BridgeProvider } from "./BridgeProvider.js";
export { swapRegistry, type SwapProvider } from "./SwapProvider.js";
export { LiFiProvider } from "./lifi.js";
export { SocketProvider } from "./socket.js";
export { AcrossProvider } from "./across.js";
export { ZoraProvider } from "./zora.js";
export { OdosProvider } from "./odos.js";
