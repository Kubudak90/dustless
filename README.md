# Dustless 🧹

One-click recovery for abandoned chain assets. Consolidate your scattered ETH to Base or Arbitrum.

## What is this?

Dustless scans your wallet for ETH stuck on "abandoned" or low-activity L2s (Blast, Mode, Zora, etc.) and helps you bridge everything back to a main chain like Base or Arbitrum—with the best available routes from LI.FI and Socket.

**No private keys required.** Everything happens through your wallet.

## Features (MVP)

- ✅ Multi-chain balance scanning (Blast, Mode, Zora, Linea, zkSync, Scroll, etc.)
- ✅ Bridge route aggregation (LI.FI + Socket)
- ✅ Best route selection by output amount
- ✅ Step-by-step wallet execution
- ✅ Non-custodial (backend never sees your keys)

## Project Structure

```
dustless/
├── apps/
│   ├── api/          # Backend (Node + Fastify + viem)
│   └── web/          # Frontend (Next.js + wagmi + TanStack Query)
├── packages/
│   └── shared/       # Shared types, chain registry
├── .env.example
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
# Clone and install
git clone https://github.com/yourname/dustless.git
cd dustless
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your RPC URLs and API keys

# Build shared package
pnpm --filter @dustless/shared build

# Start development servers
pnpm dev
```

API runs on http://localhost:4000  
Web runs on http://localhost:3000

### Environment Variables

```env
# Required
RPC_BASE=https://mainnet.base.org
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc
RPC_BLAST=https://rpc.blast.io

# Optional (improves routing)
SOCKET_API_KEY=your_socket_api_key
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wc_project_id
```

## API Endpoints

### `POST /scan`

Scan chains for stuck assets.

```json
{
  "address": "0x...",
  "chainIds": [81457, 34443, 7777777]
}
```

### `POST /quote`

Get bridge quotes for a transfer.

```json
{
  "fromChainId": 81457,
  "toChainId": 8453,
  "tokenSymbol": "ETH",
  "amountWei": "100000000000000000",
  "fromAddress": "0x..."
}
```

### `POST /build`

Build transaction data for a selected quote.

```json
{
  "quote": { /* quote object from /quote */ },
  "userAddress": "0x..."
}
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   LI.FI     │
│  (Next.js)  │     │  (Fastify)  │     │   Socket    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │    RPCs     │
       │            │ (viem)      │
       │            └─────────────┘
       │
       ▼
┌─────────────┐
│   Wallet    │
│  (wagmi)    │
└─────────────┘
```

1. **Frontend** connects to user's wallet via wagmi
2. **Backend** scans balances via viem RPC calls
3. **Backend** fetches quotes from LI.FI and Socket
4. **Frontend** executes transactions through user's wallet

## Security Notes

- Backend is **read-only** for user data (balances only)
- Transaction data is built server-side but **signed client-side**
- No private keys ever touch the server
- Always verify transaction details in your wallet before signing

## What's Next (Post-MVP)

- [ ] ERC-20 token support
- [ ] Price oracle integration (USD values)
- [ ] Transaction simulation before execution
- [ ] Smart account support (true one-click via batching)
- [ ] Gas sponsorship for dust amounts
- [ ] Scheduled recovery (set and forget)

## Tech Stack

**Backend:**
- Node.js + TypeScript
- Fastify (web framework)
- viem (Ethereum interactions)
- zod (validation)
- undici (HTTP client)

**Frontend:**
- Next.js 14 (App Router)
- wagmi + viem (Web3)
- TanStack Query
- Tailwind CSS

## License

MIT

---

Built with ☕ and frustration at having 0.003 ETH stuck on 7 different chains.
