import { registry } from "./BridgeProvider.js";
import { LiFiProvider } from "./lifi.js";
import { SocketProvider } from "./socket.js";

// Register all providers
registry.register(new LiFiProvider());
registry.register(new SocketProvider());

export { registry, type BridgeProvider } from "./BridgeProvider.js";
export { LiFiProvider } from "./lifi.js";
export { SocketProvider } from "./socket.js";
