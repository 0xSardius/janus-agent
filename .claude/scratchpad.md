# Janus Agent — Development Scratchpad

## Current Status: Ready to Fund & Launch

**Date**: 2026-02-17
**Tests**: 437 passing (27 test files)
**Type errors**: 0
**Wallet**: `0x9E907DdB8ea3D6e2f9dCf876CdE7297c50E67F67` (local viem wallet, Base Mainnet)
**Budget**: $100 at ~$1,973/ETH ≈ 0.05 ETH
**Railway**: Deployed (monitoring-only, needs funding)

## Phase History

### Phase 1: Core Infrastructure — COMPLETE
- Scaffolded pnpm monorepo with TypeScript + vitest
- Built all 5 contexts: Monitor, Analyzer, Creator, Launcher, Position Manager
- Decision engine with 7-factor weighted scoring
- Safety module with circuit breakers, gas limits, emergency stop
- Discord alerts + main runner loop
- 105 tests passing

### Phase 2: LLM Enhancement — COMPLETE
- Anthropic Claude via Vercel AI SDK for concept generation
- Fal.ai Flux Schnell for image generation
- LLM-enhanced scoring (60% base + 40% LLM blend, cached)
- `ENABLE_LLM_SCORING` toggle in runner
- 105 tests passing

### Phase 3: Full Autonomy — COMPLETE (2026-02-08)
Implemented 5 streams:

**Stream A: x402 Micropayments**
- `src/x402/client.ts` — signer adapter, spend tracker, payment-enabled fetch wrapper
- Safety: max $0.10/request, $5.00/day caps
- 21 tests

**Stream B: Alerts Enhancement**
- Slack Block Kit support alongside Discord
- Unified `sendAlert()` routes to Discord + Slack + console
- New Phase 3 alerts: `alertX402Payment`, `alertIdentityRegistered`, `alertWalletFunded`, `alertShutdown`
- 24 tests

**Stream C: ERC-8004 Identity**
- `src/identity/abi.ts` — minimal viem ABI for IdentityRegistry
- `src/identity/erc8004.ts` — registration, existing identity lookup, URI update, JSON generation
- `ENABLE_IDENTITY_REGISTRATION` toggle, `ERC8004_AGENT_ID` env persistence
- 23 tests

**Stream D: Wallet Readiness**
- `src/wallet/funding-guide.ts` — readiness report + budget estimation
- `testWalletConnection()` in provider.ts
- 12 tests

**Stream E: Railway Deployment**
- Multi-stage Dockerfile (builder + runner) for pnpm monorepo
- `railway.toml` with health check config
- Graceful SIGTERM/SIGINT shutdown with alerts
- Enhanced `/health` endpoint (uptime, features, version)

### Phase 4: Optimization — COMPLETE (2026-02-08)
Implemented 3 features that form a closed loop:

**Feature 1: Social Signals (Farcaster + Twitter)**
- `src/social/farcaster.ts` — Neynar API `/v2/farcaster/cast/search` client, log-scaled engagement normalization
- `src/social/twitter.ts` — Twitter API v2 `/2/tweets/search/recent` client, engagement scoring
- `src/social/signals.ts` — Unified provider factory with caching, weighted blending, graceful degradation
- 25 tests (8 farcaster + 7 twitter + 10 signals)

**Feature 2: Performance Tracking + Auto-Tuning**
- `src/performance/tracker.ts` — profit-to-score mapping, concept categorization, factor correlations, EMA learning
- `src/performance/auto-tuner.ts` — bounded weight optimization [0.1, 0.5], 0.05 adjustment rate, 6h cycles
- 34 tests (22 tracker + 12 auto-tuner)

**Feature 3: x402-Gated Agent-as-a-Service API**
- `src/api/` — /api/trends, scores, portfolio, performance with x402 payment gating
- 25 tests (7 middleware + 10 routes + 8 server)

### Phase 5: Production Hardening — COMPLETE (2026-02-10)
Implemented 3 features:

**Feature 1: State Persistence (SQLite)**
- `src/persistence/database.ts` — SQLite via `better-sqlite3`, WAL mode, 8 tables
- `src/persistence/state-sync.ts` — Hydration at startup + persist after every mutation
- 33 tests (21 database + 12 state-sync)

**Feature 2: Runner Hardening**
- `src/utils/retry.ts` — exponential backoff (3 retries, 1s base, 30s max)
- `src/utils/gas-tracker.ts` — real gas spend tracking per UTC day
- consecutiveFailures counter, USDC balance reads, UTC daily reset
- 16 tests (6 retry + 10 gas-tracker)

**Feature 3: Flaunch SDK Integration**
- `src/flaunch/client.ts` — `@flaunch/sdk@0.9.16` wrapper (buyCoin/sellCoin/withdrawCreatorRevenue/flaunchIPFS)
- `src/flaunch/receipt-parser.ts` — ABI-based ERC-20/WETH receipt decoding
- 19 tests (8 client + 11 receipt-parser)

### Pre-Deployment Testing — COMPLETE (2026-02-15)
Added 100 tests across 4 new test files covering launcher, wallet, creator, runner integration.

### Go-Live Prep — COMPLETE (2026-02-16)
- Switched from CDP Server Wallet to local viem private key wallet (CDP rate-limited)
- `provider.ts` supports both modes: `WALLET_PRIVATE_KEY` (local) or CDP API keys
- Uses AgentKit `ViemWalletProvider` for compatibility
- Added `check-wallet.ts` utility for wallet verification
- Tuned all constants for $100 budget at ~$2k/ETH
- Added `@coinbase/coinbase-sdk` as direct dependency

## ▶ RESUME HERE — Fund & Launch

**Wallet address**: `0x9E907DdB8ea3D6e2f9dCf876CdE7297c50E67F67`
**Wallet type**: Local private key (viem) — NOT a CDP server wallet
**Private key**: Stored in `.env` as `WALLET_PRIVATE_KEY`
**To access funds**: Import private key into MetaMask/Rabby on Base network

### Immediate Next Steps

1. **[ ] Fund the wallet** — Send ~0.05 ETH on Base to `0x9E907DdB8ea3D6e2f9dCf876CdE7297c50E67F67`
   - Budget: $25 gas, $40 positions (5 x ~$5), $25 buffer, $10 emergency
   - Can fund from Coinbase, MetaMask, or any Base-compatible wallet

2. **[ ] Verify funding** — Run `cd packages/agent && node --env-file=../../.env --import tsx src/check-wallet.ts`

3. **[ ] First local run** — `pnpm start` (or `node packages/agent/dist/runner.js`)
   - Watch logs: wallet connects, balance reads, subgraph polls
   - Wait for agent to find concept scoring > 0.65 and auto-launch
   - Monitor via Discord/Slack alerts or `/api/portfolio`

4. **[ ] Deploy to Railway** (once stable locally)
   - Push to GitHub, connect in Railway, set env vars, deploy

### Current Constants ($100 Budget at ~$2k/ETH)

| Setting | Value | USD equiv |
|---|---|---|
| `buyAmountETH` | 0.0025 | ~$5/position |
| `maxActivePositions` | 5 | ~$25 total |
| `minEthBalance` | 0.005 | ~$10 floor |
| `maxDailyGasSpend` | 0.01 | ~$20/day |
| `maxSingleLaunchGas` | 0.005 | ~$10/launch |
| `maxLaunchesPerDay` | 3 | — |
| `maxBuyPerToken` | 0.0025 | ~$5 |

### Env Vars Checklist

| Var | Status | Notes |
|---|---|---|
| `WALLET_PRIVATE_KEY` | Set | Local viem wallet |
| `BASE_RPC_URL` | Set | Alchemy endpoint |
| `FLAUNCH_SUBGRAPH_URL` | Set | Goldsky endpoint |
| `ANTHROPIC_API_KEY` | Set | Claude for concept gen |
| `FAL_KEY` | Set | Fal.ai for images |
| `CDP_API_KEY_NAME` | Set (unused) | Rate-limited, not active |
| `CDP_API_KEY_PRIVATE` | Set (unused) | Rate-limited, not active |
| `NEYNAR_API_KEY` | Optional | Farcaster signals |
| `TWITTER_BEARER_TOKEN` | Optional | Twitter signals |
| `DISCORD_WEBHOOK_URL` | Optional | Alerts |
| `SLACK_WEBHOOK_URL` | Optional | Alerts |

### Future Work
- [ ] Dashboard UI (Next.js monitoring interface)
- [ ] Advanced social signals (Farcaster frames, Twitter spaces)
- [ ] Multi-chain support

## Architecture Notes

- Wallet provider auto-selects: `WALLET_PRIVATE_KEY` → local viem wallet, else CDP
- Local wallet uses AgentKit `ViemWalletProvider` — full compatibility with all AgentKit features
- `_viemWalletClient` stashed on provider for `createViemClients()` to access
- All modules use native `fetch` (no axios)
- Tests mock at the `globalThis.fetch` / viem client level — no real network calls
- API server uses raw `http.createServer()` — no Express dependency
- All Phase 4 features are opt-in via env vars — no keys = existing behavior preserved

## Dependencies

### Phase 3
- `@x402/fetch@^2.3.0`, `@x402/evm@^2.3.0`

### Phase 5
- `better-sqlite3@^12.6.2` + `@types/better-sqlite3@^7.6.13`
- `@flaunch/sdk@^0.9.16`

### Go-Live
- `@coinbase/coinbase-sdk` (direct dep, needed for pnpm resolution)
