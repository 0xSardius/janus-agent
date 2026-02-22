# Janus Agent

An autonomous AI agent that monitors meme token trends on [Flaunch](https://flaunch.gg) (Base network), scores concepts using multi-factor analysis, and can programmatically launch and manage token positions.

Built as a learning project to explore autonomous agent architecture, on-chain interactions, and AI-driven decision making. **This project is paused/archived** — see [Status](#status) below.

## Architecture

Janus is built around 5 composable contexts, each with isolated state:

```
Monitor → Analyzer → Creator → Launcher → Position Manager
```

| Context | What it does |
|---------|-------------|
| **Monitor** | Polls the Flaunch subgraph for new tokens, extracts trending concepts |
| **Analyzer** | Scores concepts across volume, recency, social signals, and novelty |
| **Creator** | LLM-powered token name/symbol/description + image generation |
| **Launcher** | Executes `flaunchIPFS()` with metadata, claims Meme Stream fees |
| **Position Manager** | Staged exits at 3x/5x/10x/20x, stop loss at 0.5x, 7-day max hold |

A decision engine ties them together, using a weighted scoring matrix to decide whether to launch on each 60-second cycle.

### Supporting Systems

- **Safety module** — Balance checks, gas limits, circuit breakers, consecutive failure tracking
- **Social signals** — Farcaster (Neynar) + Twitter API v2 with caching and graceful degradation
- **Performance tracker** — Profit-to-score mapping, concept categorization, EMA-based learning
- **Auto-tuner** — Weight optimization bounded [0.1, 0.5] with 0.05 adjustment rate per 6h cycle
- **API server** — `/api/trends`, `/api/scores/:concept`, `/api/portfolio`, `/api/performance`
- **x402 gating** — Optional micropayment middleware for API endpoints
- **SQLite persistence** — Positions, launches, performance, weights, and gas records survive restarts
- **ERC-8004 identity** — On-chain agent registration
- **Alerts** — Discord + Slack webhooks

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript
- **Chain**: Base (L2) via [viem](https://viem.sh)
- **Token Launches**: [@flaunch/sdk](https://github.com/flayerlabs/flaunch-sdk)
- **LLM**: Claude via [Vercel AI SDK](https://sdk.vercel.ai)
- **Image Gen**: [Fal.ai](https://fal.ai) Flux Schnell
- **Payments**: [x402](https://docs.cdp.coinbase.com/x402/welcome) protocol
- **Persistence**: SQLite via better-sqlite3
- **Testing**: Vitest (437 tests)
- **Deployment**: Railway (Dockerfile + persistent volume)

## Project Structure

```
packages/agent/src/
├── contexts/           # 5 composable contexts (monitor, analyzer, creator, launcher, position-manager)
├── decision/           # Launch decision engine with weighted scoring
├── wallet/             # Wallet provider (local viem or CDP)
├── flaunch/            # @flaunch/sdk wrapper + receipt parsing
├── social/             # Farcaster + Twitter signal providers
├── performance/        # Performance tracking + auto-tuner
├── api/                # HTTP server, routes, x402 middleware
├── persistence/        # SQLite schema, state sync
├── x402/               # x402 payment client + spend tracking
├── identity/           # ERC-8004 on-chain identity
├── utils/              # Retry, gas tracking
├── safety.ts           # Limits & circuit breakers
├── alerts.ts           # Discord/Slack webhooks
├── constants.ts        # All tunable parameters
├── runner.ts           # Main autonomous loop
└── types.ts            # Shared types
```

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Fill in your API keys (see .env.example for details)

# Run tests
pnpm test

# Type check
pnpm typecheck

# Development (with hot reload)
pnpm dev

# Production build + run
pnpm build && pnpm start
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `WALLET_PRIVATE_KEY` | Local wallet private key (or use CDP keys) |
| `BASE_RPC_URL` | Base mainnet RPC (Alchemy, QuickNode, etc.) |
| `FLAUNCH_SUBGRAPH_URL` | Flaunch Goldsky/The Graph endpoint |
| `ANTHROPIC_API_KEY` | Claude API key for concept generation |
| `FAL_KEY` | Fal.ai key for image generation |

See [`.env.example`](.env.example) for the full list including optional social signals, alerts, and gating config.

### Deployment (Railway)

The project includes a multi-stage Dockerfile and `railway.toml` with persistent volume for SQLite:

```bash
railway up
```

## Status

**Paused/Archived.** The core infrastructure works end-to-end (monitor, score, decide, generate, launch, manage positions), and was deployed live on Base mainnet. Development was stopped due to ethical concerns about the autonomous token launch model.

### What Works

- Subgraph monitoring and trend extraction
- Multi-factor concept scoring with optional LLM enhancement
- AI-powered token metadata + image generation
- Flaunch SDK integration (launch, buy, sell, claim fees)
- Position management with staged exits
- SQLite persistence across restarts
- Full test suite (437 tests)

### Known Issues at Time of Pause

- Self-buy transaction reverts after launch (Flaunch routing issue under investigation)
- Token name generation lacks diversity (tends to repeat concepts)
- Position monitoring errors need better isolation from the main loop

## License

MIT
