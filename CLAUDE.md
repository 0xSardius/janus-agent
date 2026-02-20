# Autonomous Token Launcher Agent

## Project Overview

An autonomous AI agent that monitors meme token trends on Flaunch (Base network), generates creative iterations on trending concepts, programmatically launches tokens, buys its own tokens at launch, and manages positions for dual-income (fees + trading gains).

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript
- **Agent Framework**: Daydreams AI (`@daydreamsai/core`) — composable contexts, persistent memory
- **Wallet**: CDP Server Wallet v2 via AgentKit (`@coinbase/agentkit`) — TEE-protected, API-based signing
- **Token Launches**: Flaunch SDK (`@flaunch/sdk`) — programmatic launches on Base
- **Payments**: x402 protocol for micropayments (Dreams Router)
- **Identity**: ERC-8004 for on-chain agent registration
- **Deployment**: Railway (long-running Node.js process)
- **Package Manager**: pnpm
- **Validation**: zod
- **Chain Interaction**: viem

## Architecture: 5 Daydreams Contexts

Each context is a composable unit with isolated state that chains via `.use()`:

1. **Monitor Context** — Polls Flaunch subgraph for new tokens, extracts trending concepts
2. **Analyzer Context** — Scores concepts (volume 30%, recency 25%, social 25%, novelty 20%), selects candidates
3. **Creator Context** — LLM-powered token name/symbol/description generation, image generation via x402
4. **Launcher Context** — Executes `flaunch.flaunchIPFS()` with metadata, claims Meme Stream fees
5. **Position Manager Context** — Buys own token at launch (~0.003 ETH), staged exits at 3x/5x/10x/20x, stop loss at 0.5x, 7-day max hold

Context composition chain: Monitor → Analyzer → Creator → Launcher → Position Manager

## Execution Loop (runner.ts)

```
while (true) {
  1. Safety check (balance, gas limits, circuit breakers)
  2. Poll Flaunch subgraph for new tokens
  3. Analyze and score trending concepts
  4. Decision engine: should we launch? (weighted score > 0.65)
  5. If yes: Generate metadata → Launch token → Buy own token
  6. Monitor ALL active positions for exits (every cycle)
  7. Claim accumulated fees periodically
  8. Sleep 60 seconds
}
```

## Key Directory Structure

```
autonomous-token-launcher/
├── packages/
│   ├── agent/
│   │   ├── src/
│   │   │   ├── contexts/
│   │   │   │   ├── monitor.ts           # Flaunch subgraph polling
│   │   │   │   ├── analyzer.ts          # Trend scoring (+ social provider, custom weights)
│   │   │   │   ├── creator.ts           # LLM concept + image generation
│   │   │   │   ├── launcher.ts          # Flaunch SDK launches
│   │   │   │   └── position-manager.ts  # Buy/sell/monitor positions
│   │   │   ├── decision/
│   │   │   │   └── engine.ts            # Launch decision logic (+ performance state)
│   │   │   ├── wallet/
│   │   │   │   ├── provider.ts          # CDP AgentKit wallet init
│   │   │   │   └── funding-guide.ts     # Wallet readiness & funding estimates
│   │   │   ├── x402/
│   │   │   │   ├── client.ts            # x402 payment fetch wrapper + spend tracking
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── identity/
│   │   │   │   ├── abi.ts               # ERC-8004 IdentityRegistry ABI
│   │   │   │   ├── erc8004.ts           # On-chain agent registration & URI
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── social/
│   │   │   │   ├── farcaster.ts         # Neynar API client for Farcaster signals
│   │   │   │   ├── twitter.ts           # Twitter API v2 client
│   │   │   │   ├── signals.ts           # Unified provider with caching + degradation
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── performance/
│   │   │   │   ├── tracker.ts           # Performance scoring, categorization, correlations
│   │   │   │   ├── auto-tuner.ts        # Weight optimization with bounded normalization
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── api/
│   │   │   │   ├── middleware.ts         # x402 payment verification
│   │   │   │   ├── routes.ts            # /api/trends, scores, portfolio, performance
│   │   │   │   ├── server.ts            # HTTP server with router + health check
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── persistence/
│   │   │   │   ├── database.ts          # SQLite schema + CRUD operations
│   │   │   │   ├── state-sync.ts        # In-memory ↔ DB bridge (hydration + persist)
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── utils/
│   │   │   │   ├── retry.ts             # Exponential backoff retry utility
│   │   │   │   ├── gas-tracker.ts       # Real gas spend tracking per UTC day
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── flaunch/
│   │   │   │   ├── client.ts            # @flaunch/sdk wrapper adapter
│   │   │   │   ├── receipt-parser.ts    # ABI-based ERC-20/WETH receipt decoding
│   │   │   │   └── index.ts             # Barrel export
│   │   │   ├── safety.ts                # Limits & circuit breakers
│   │   │   ├── alerts.ts                # Discord/Slack webhooks
│   │   │   ├── runner.ts                # Main autonomous loop + API server + DB persistence
│   │   │   └── index.ts                 # Agent initialization
│   │   ├── Dockerfile
│   │   ├── railway.toml
│   │   └── package.json
│   └── dashboard/                        # Optional Next.js monitoring UI
├── .env.example
├── docker-compose.yml
└── README.md
```

## Critical Implementation Details

### Wallet Setup (Local Viem Wallet)
```typescript
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { ViemWalletProvider } from "@coinbase/agentkit";

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const walletProvider = new ViemWalletProvider(walletClient);
// Falls back to CDP Server Wallet if WALLET_PRIVATE_KEY not set
```

### Flaunch Launch Call
```typescript
const hash = await flaunch.flaunchIPFS({
  name, symbol,
  fairLaunchPercent: 0,
  fairLaunchDuration: 30 * 60, // 30 min
  initialMarketCapUSD: 10_000,
  creator: agentWalletAddress,
  creatorFeeAllocationPercent: 100, // Agent keeps all fees
  metadata: { base64Image, description },
});
const poolData = await flaunch.getPoolCreatedFromTx(hash);
```

### Position Strategy Constants
```typescript
const POSITION_STRATEGY = {
  buyAmountETH: parseEther("0.0025"),   // ~$5 per position
  maxActivePositions: 5,                 // Max concurrent positions
  maxPortfolioExposure: 0.25,           // 25% of wallet max
  sellTranches: [
    { triggerMultiple: 3,  sellPercent: 25 },
    { triggerMultiple: 5,  sellPercent: 25 },
    { triggerMultiple: 10, sellPercent: 25 },
    { triggerMultiple: 20, sellPercent: 25 },
  ],
  stopLossMultiple: 0.5,
  maxHoldDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
};
```

### Safety Limits
```typescript
const SAFETY_LIMITS = {
  maxDailyGasSpend: parseEther("0.01"),      // ~$20/day gas cap
  maxSingleLaunchGas: parseEther("0.005"),   // ~$10 per launch
  minEthBalance: parseEther("0.005"),        // ~$10 emergency floor
  maxLaunchesPerDay: 3,
  minTimeBetweenLaunches: 2 * 60 * 60 * 1000, // 2 hours
  minConceptScore: 0.65,
  minConfidenceThreshold: 0.7,
  maxBuyPerToken: parseEther("0.0025"),      // ~$5 per position
  maxActivePositions: 5,
  maxPortfolioExposure: 0.25,
  stopLossMultiple: 0.5,
  maxHoldDays: 7,
  maxConsecutiveFailures: 3,
  pauseOnHighGas: 100, // gwei
};
```

## Environment Variables

```
CDP_API_KEY_NAME=          # From portal.cdp.coinbase.com
CDP_API_KEY_PRIVATE=       # From portal.cdp.coinbase.com
BASE_RPC_URL=              # Alchemy or QuickNode
FLAUNCH_SUBGRAPH_URL=      # Goldsky/The Graph endpoint
ANTHROPIC_API_KEY=         # For LLM concept generation (Claude)
FAL_KEY=                   # For image generation (Fal.ai Flux)
ENABLE_LLM_SCORING=        # true/false - toggle LLM-enhanced scoring
LLM_ANALYSIS_LIMIT=        # Max concepts to analyze with LLM per cycle (default: 5)
DISCORD_WEBHOOK_URL=       # For alerts (optional)
SLACK_WEBHOOK_URL=         # For Slack alerts (optional)
ENABLE_IDENTITY_REGISTRATION= # Enable ERC-8004 registration at startup
AGENT_URI=                 # Agent metadata URI for ERC-8004
BASE_IDENTITY_REGISTRY=    # Override default Base identity registry
ERC8004_AGENT_ID=          # Set after first registration
NEYNAR_API_KEY=            # Farcaster social signals (Neynar)
TWITTER_BEARER_TOKEN=      # Twitter/X API v2 bearer token
ENABLE_AUTO_TUNER=         # true/false - enable weight auto-tuning
ENABLE_API_GATING=         # true/false - enable x402 gating on /api/* endpoints
SQLITE_DB_PATH=            # SQLite database file path (default: ./janus.db)
```

## Budget: $100 Experiment

- Gas Reserve: $25
- Position Capital: $40 (5 positions at ~$5 each)
- Operating Buffer: $25
- Emergency Reserve: $10

## Key Dependencies

```json
{
  "@coinbase/agentkit": "^0.2.0",
  "viem": "^2.30.6",
  "zod": "^3.24.2",
  "@ai-sdk/anthropic": "^1.2.12",
  "ai": "^4.3.16",
  "@fal-ai/client": "^1.2.3",
  "vitest": "^2.1.9",
  "@x402/fetch": "^2.3.0",
  "@x402/evm": "^2.3.0",
  "better-sqlite3": "^12.6.2",
  "@flaunch/sdk": "^0.9.16"
}
```

## Implementation Progress

### Phase 1: Core Infrastructure (COMPLETE)
- [x] Project scaffolding (pnpm monorepo, TypeScript, vitest)
- [x] Monitor Context - Flaunch subgraph polling, concept extraction
- [x] Analyzer Context - Multi-factor scoring (volume, recency, social, novelty)
- [x] Creator Context - Token metadata generation with fallback patterns
- [x] Launcher Context - Flaunch SDK integration
- [x] Position Manager Context - Buy/sell logic, staged exits, stop loss
- [x] Decision Engine - Weighted launch decisions
- [x] Safety module - Balance checks, gas limits, circuit breakers
- [x] Alerts module - Discord/Slack webhook support
- [x] Main runner loop - Full autonomous cycle

### Phase 2: LLM Enhancement (COMPLETE)
- [x] Anthropic Claude integration (Vercel AI SDK)
- [x] Fal.ai Flux Schnell image generation
- [x] LLM-powered concept generation (name/symbol/description)
- [x] LLM-enhanced concept scoring (blended 60% base + 40% LLM)
- [x] Runner integration with `ENABLE_LLM_SCORING` toggle
- [x] Test suite: 105 tests passing

### Phase 3: Full Autonomy (COMPLETE)
- [x] x402 micropayment integration (client, signer adapter, spend tracking)
- [x] ERC-8004 on-chain agent identity (registration, URI update, JSON schema)
- [x] Slack + Discord alerting with routing, Phase 3 alert types
- [x] CDP wallet readiness checks + funding guide
- [x] Railway deployment (multi-stage Dockerfile, railway.toml, graceful shutdown)
- [x] Test suite: 185 tests passing

### Phase 4: Optimization (COMPLETE)
- [x] Social signals — Farcaster (Neynar) + Twitter API v2 with caching, weighted blending, graceful degradation
- [x] Performance tracking — Profit-to-score mapping, concept categorization, factor correlation tracking, EMA-based learning
- [x] Auto-tuner — Weight optimization bounded [0.1, 0.5] with 0.05 adjustment rate per 6h cycle
- [x] Agent-as-a-service API — /api/trends, /api/scores/:concept, /api/portfolio, /api/performance
- [x] x402 payment gating middleware for API endpoints ($0.01/request)
- [x] Full runner integration — social provider, performance recording, auto-tuner, API server replaces health-only server
- [x] Test suite: 269 tests passing

### Phase 5: Production Hardening (COMPLETE)
- [x] SQLite state persistence — positions, launched tokens, performance, weights, gas records survive restarts
- [x] Flaunch SDK integration — replaced stubs with real `@flaunch/sdk@0.9.16` wrapper (buyCoin/sellCoin/withdrawCreatorRevenue/flaunchIPFS)
- [x] ABI-based receipt parsing — ERC-20 Transfer + WETH Withdrawal decoding via viem
- [x] Runner hardening — real gas tracking (GasTracker), consecutive failure counter, USDC balance reads, exponential backoff retry on RPC calls, UTC daily reset
- [x] DB hydration at startup — loads all persisted state before main loop begins
- [x] Persistence after mutations — positions, launches, exits, performance, weight tunes, gas records all saved
- [x] Test suite: 337 tests passing

### Pre-Deployment Testing (COMPLETE)
- [x] Launcher context tests — cooldown, daily limits, balance checks, SDK success/failure, fee claims (25 tests)
- [x] Wallet provider tests — env var validation, CDP init, viem client fallback, connection testing (18 tests)
- [x] Creator context tests — LLM generation, image failure resilience, fallback patterns, pending/history management (35 tests)
- [x] Runner integration tests — full cycle orchestration, error recovery, safety checks, daily reset, decision engine (22 tests)
- [x] Test suite: 437 tests passing

### Deployment (LIVE)
- [x] Wallet funded with 0.05 ETH on Base (`0x9E907DdB8ea3D6e2f9dCf876CdE7297c50E67F67`)
- [x] Deployed to Railway — running autonomously (cycle ~60s)
- [x] API keys configured (Anthropic, Fal.ai, Alchemy RPC, Flaunch subgraph)

### Future Work
- [ ] Dashboard UI (Next.js monitoring interface)
- [ ] Advanced social signals (Farcaster frames, Twitter spaces)
- [ ] Multi-chain support

## Resuming Development

When returning to this project:
1. Run `pnpm install` to ensure dependencies are up to date
2. Run `pnpm test` to verify everything still works (437 tests)
3. Run `pnpm typecheck` to verify no type errors
4. Check Railway logs: `railway logs` to see live agent cycles
5. Check wallet balance on Base for `0x9E907DdB8ea3D6e2f9dCf876CdE7297c50E67F67`
6. Agent is LIVE on Railway — all API keys configured, wallet funded with 0.05 ETH

## Reference Docs

- Full Architecture: See `autonomous-token-launcher-architecture.md` in project root
- Daydreams: https://docs.dreams.fun
- AgentKit: https://docs.cdp.coinbase.com/agent-kit/welcome
- Server Wallet v2: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
- Flaunch SDK: https://github.com/flayerlabs/flaunch-sdk
- Flaunch Docs: https://docs.flaunch.gg
- x402: https://docs.cdp.coinbase.com/x402/welcome
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
