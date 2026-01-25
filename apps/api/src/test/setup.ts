/**
 * Global test setup for backend tests
 */

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '4001';

// Mock RPC URLs (use test RPCs or mock servers)
process.env.RPC_BASE = 'https://mainnet.base.org';
process.env.RPC_ARBITRUM = 'https://arb1.arbitrum.io/rpc';
process.env.RPC_BLAST = 'https://rpc.blast.io';
process.env.RPC_MODE = 'https://mainnet.mode.network';
process.env.RPC_ZORA = 'https://rpc.zora.energy';

// Mock API keys (not required for basic tests)
process.env.SOCKET_API_KEY = 'test_socket_key';
process.env.LIFI_API_KEY = 'test_lifi_key';

// CORS
process.env.CORS_ORIGIN = 'http://localhost:3000';
