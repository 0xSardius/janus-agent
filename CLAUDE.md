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
│   │   │   │   ├── analyzer.ts          # Trend scoring
│   │   │   │   ├── creator.ts           # LLM concept + image generation
│   │   │   │   ├── launcher.ts          # Flaunch SDK launches
│   │   │   │   └── position-manager.ts  # Buy/sell/monitor positions
│   │   │   ├── decision/
│   │   │   │   └── engine.ts            # Launch decision logic
│   │   │   ├── wallet/
│   │   │   │   └── provider.ts          # CDP AgentKit wallet init
│   │   │   ├── x402/
│   │   │   │   └── client.ts            # x402 payment middleware
│   │   │   ├── identity/
│   │   │   │   └── erc8004.ts           # On-chain agent registration
│   │   │   ├── safety.ts                # Limits & circuit breakers
│   │   │   ├── alerts.ts                # Discord/Slack webhooks
│   │   │   ├── runner.ts                # Main autonomous loop
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

### Wallet Setup (CDP Server Wallet v2)
```typescript
import { CdpWalletProvider } from "@coinbase/agentkit";
const walletProvider = await CdpWalletProvider.configureWithWallet({
  apiKeyName: process.env.CDP_API_KEY_NAME!,
  apiKeyPrivate: process.env.CDP_API_KEY_PRIVATE!,
  networkId: "base-mainnet",
});
// walletProvider.getWalletClient() returns viem-compatible client
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
  buyAmountETH: parseEther("0.003"),    // ~$8-10 per position
  maxActivePositions: 10,
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
  maxDailyGasSpend: parseEther("0.5"),
  maxSingleLaunchGas: parseEther("0.02"),
  minEthBalance: parseEther("0.1"),
  maxLaunchesPerDay: 5,
  minTimeBetweenLaunches: 2 * 60 * 60 * 1000, // 2 hours
  minConceptScore: 0.65,
  minConfidenceThreshold: 0.7,
  maxBuyPerToken: parseEther("0.003"),
  maxActivePositions: 10,
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
```

## Budget: $200 Experiment

- Gas Reserve: $50
- Position Capital: $80 (8-10 positions at ~$8-10 each)
- Operating Buffer: $50
- Emergency Reserve: $20

## Key Dependencies

```json
{
  "@coinbase/agentkit": "^0.2.0",
  "viem": "^2.30.6",
  "zod": "^3.24.2",
  "@ai-sdk/anthropic": "^1.2.12",
  "ai": "^4.3.16",
  "@fal-ai/client": "^1.2.3",
  "vitest": "^2.1.9"
}
```

## Implementation Progress

### Phase 1: Core Infrastructure (COMPLETE)
- [x] Project scaffolding (pnpm monorepo, TypeScript, vitest)
- [x] Monitor Context - Flaunch subgraph polling, concept extraction
- [x] Analyzer Context - Multi-factor scoring (volume, recency, social, novelty)
- [x] Creator Context - Token metadata generation with fallback patterns
- [x] Launcher Context - Flaunch SDK integration (stub, needs real SDK)
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

### Phase 3: Full Autonomy (NOT STARTED)
- [ ] x402 micropayment integration
- [ ] ERC-8004 on-chain agent identity
- [ ] Real Discord/Slack alerting setup
- [ ] CDP wallet funding and testing
- [ ] Railway deployment

### Phase 4: Optimization (NOT STARTED)
- [ ] Social signals (Twitter/Farcaster integration)
- [ ] Performance tracking and learning
- [ ] Agent-as-a-service API

## Resuming Development

When returning to this project:
1. Run `pnpm install` to ensure dependencies are up to date
2. Run `pnpm test` to verify everything still works (105 tests)
3. Check `.env.example` for required environment variables
4. Phase 3 is next: Start with x402 client or ERC-8004 identity

## Reference Docs

- Full Architecture: See `autonomous-token-launcher-architecture.md` in project root
- Daydreams: https://docs.dreams.fun
- AgentKit: https://docs.cdp.coinbase.com/agent-kit/welcome
- Server Wallet v2: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
- Flaunch SDK: https://github.com/flayerlabs/flaunch-sdk
- Flaunch Docs: https://docs.flaunch.gg
- x402: https://docs.cdp.coinbase.com/x402/welcome
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
