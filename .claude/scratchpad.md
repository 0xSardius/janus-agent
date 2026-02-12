# Janus Agent — Development Scratchpad

## Current Status: Phase 5 Complete (All Phases Done)

**Date**: 2026-02-10
**Tests**: 337 passing (23 test files)
**Type errors**: 0

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
- `src/wallet/funding-guide.ts` — readiness report + $200 budget estimation
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
- `src/social/signals.ts` — Unified provider factory with:
  - 5-minute in-memory cache (case-insensitive keys)
  - Weighted combination: Farcaster 60% / Twitter 40%
  - Graceful degradation: no APIs = 0.5, one API = use it at 100%, API failure = default score
- Replaces hardcoded `socialScore = 0.5` in `analyzer.ts:60`
- `ScoreConceptOptions` interface threads social provider + custom weights through all scoring functions
- Removed placeholder `fetchSocialSignals()` from analyzer
- 25 tests (8 farcaster + 7 twitter + 10 signals)

**Feature 2: Performance Tracking + Auto-Tuning**
- `src/performance/tracker.ts`:
  - `calculatePerformanceScore()` — maps profit multiple to 0-1 (0.5x→0, 1.0x→0.5, 20x→1.0)
  - `categorizeConcept()` — keyword-based buckets (animal, ai, food, culture, meta, other)
  - `recordPositionPerformance()` — updates EMA for category, tracks factor correlations
  - `getRecentSuccessRate()` — replaces placeholder in decision engine
- `src/performance/auto-tuner.ts`:
  - `shouldTune()` — min 10 samples + 6h interval
  - `calculateWeightAdjustments()` — factors with higher correlation to profit get more weight
  - `boundedNormalize()` — iteratively clamps and redistributes to keep weights in [0.1, 0.5], sum=1.0
  - Adjustment rate: 0.05 per cycle (slow, safe)
- `decision/engine.ts` — `makeDecision()` now accepts optional `performanceState`, uses real success rate
- Added `concept?: string` to `PositionSchema` for linking positions back to originating concept
- 34 tests (22 tracker + 12 auto-tuner)

**Feature 3: x402-Gated Agent-as-a-Service API**
- `src/api/middleware.ts` — `verifyX402Payment()` checks `X-Payment-Proof` header, `send402Response()` sends 402 with details
- `src/api/routes.ts` — 4 endpoints:
  - `GET /api/trends` — current scored concepts from analyzer
  - `GET /api/scores/:concept` — on-demand scoring (returns cached or social score)
  - `GET /api/portfolio` — active positions + P&L
  - `GET /api/performance` — results, success rate, category breakdown, factor correlations
- `src/api/server.ts` — `createApiServer()` replaces old health-only server
  - `/health` stays free (Railway health checks)
  - `/api/*` routes gated when `ENABLE_API_GATING=true`
  - Price: $0.01/request
- 25 tests (7 middleware + 10 routes + 8 server)

**Runner Integration**
- Social provider initialized from `NEYNAR_API_KEY` / `TWITTER_BEARER_TOKEN` env vars
- Performance state created at startup, performance recorded after every position exit
- Auto-tuner runs periodically (when enabled), updates `currentWeights`
- `ScoreConceptOptions` passed to all scoring calls (social provider + auto-tuned weights)
- `makeDecision()` receives `performanceState` for real success rate
- API server replaces health-only server, shares contexts via `ApiContext` getters

### Phase 5: Production Hardening — COMPLETE (2026-02-10)
Implemented 3 features:

**Feature 1: State Persistence (SQLite)**
- `src/persistence/database.ts` — SQLite via `better-sqlite3`, WAL mode, 8 tables:
  - `positions`, `launched_tokens`, `performance_results`, `category_performance`, `factor_correlations`, `scoring_weights`, `agent_metadata`, `gas_records`
  - BigInt stored as TEXT, single-row constraint on scoring_weights
- `src/persistence/state-sync.ts` — Hydration at startup + persist after every mutation
  - `hydrateFromDatabase()` loads all state into in-memory objects
  - `persistPosition()`, `persistLaunchResult()`, `persistPerformanceResult()`, etc.
- 33 tests (21 database + 12 state-sync)

**Feature 2: Runner Hardening**
- `src/utils/retry.ts` — `withRetry<T>()` exponential backoff (3 retries, 1s base, 30s max)
- `src/utils/gas-tracker.ts` — `GasTracker` class tracks gas per UTC day, `estimateGasFromReceipt()`
- Runner fixes:
  - `consecutiveFailures` — real counter (increment on error, reset on success)
  - `dailyGasSpent` — `gasTracker.getTodayGasSpent()` replaces hardcoded `BigInt(0)`
  - `usdcBalance` — `readUSDCBalance()` via `publicClient.readContract()` with `erc20Abi`
  - RPC calls wrapped with `withRetry<bigint>()` (getBalance, pollNewTokens, getMarketConditions)
  - UTC midnight daily reset for gas tracker + launch counters
- 16 tests (6 retry + 10 gas-tracker)

**Feature 3: Flaunch SDK Integration**
- `src/flaunch/client.ts` — `createFlaunchWrapper(publicClient, walletClient)` adapts `@flaunch/sdk@0.9.16`:
  - `buyCoin()` with `swapType: "EXACT_IN"`, slippage as percent (not bps)
  - `sellCoin()` / `withdrawCreatorRevenue()` / `flaunchIPFS()` / `getPoolCreatedFromTx()`
- `src/flaunch/receipt-parser.ts` — ABI-based decoding:
  - `parseSwapReceiptForTokens()` — ERC-20 Transfer events via `decodeEventLog`
  - `parseSwapReceiptForETH()` — WETH Transfer + Withdrawal events (WETH: `0x4200000000000000000000000000000000000006`)
- Replaced stubs in `launcher.ts` and `position-manager.ts`
- `wallet/provider.ts` — renamed `createFlaunchClient` → `createViemClients` (deprecated re-export kept)
- 19 tests (8 client + 11 receipt-parser)

## ▶ RESUME HERE — Mainnet Deployment

**All 5 phases of code are complete. The agent has never run against a real chain.**

### Decision Made
- Skipping Base Sepolia testnet — going straight to Base mainnet with $200 experiment
- Flaunch DOES support Base Sepolia (SDK has all contract addresses), but user chose mainnet
- Earnings (trading gains + creator fees) accumulate in the CDP wallet, withdrawable anytime

### Before You Can Run the Agent — Checklist

1. **[ ] Get CDP API keys** — https://portal.cdp.coinbase.com
   - Create project → generate API key → get `CDP_API_KEY_NAME` + `CDP_API_KEY_PRIVATE`
   - The wallet is created automatically on first run

2. **[ ] Fund the CDP wallet** — ~0.07 ETH on Base (~$200)
   - Run the agent once to see the wallet address in logs
   - Send ETH to that address on Base network
   - Budget: $50 gas, $80 positions, $50 buffer, $20 emergency

3. **[ ] Get Anthropic API key** — https://console.anthropic.com
   - `ANTHROPIC_API_KEY=sk-ant-...`

4. **[ ] Get Fal.ai key** — https://fal.ai/dashboard/keys
   - `FAL_KEY=...` (for image generation)

5. **[ ] Get Base RPC URL** — Alchemy or QuickNode recommended
   - `BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`
   - Free public fallback: `https://mainnet.base.org`

6. **[ ] Get Flaunch subgraph URL** — Goldsky endpoint
   - `FLAUNCH_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_.../subgraphs/flaunch-base/1.0.0/gn`
   - Check https://docs.flaunch.gg for current endpoint

7. **[ ] (Optional) Social signal API keys**
   - `NEYNAR_API_KEY` — Farcaster signals (https://neynar.com)
   - `TWITTER_BEARER_TOKEN` — Twitter/X signals
   - Without these, social score defaults to 0.5 (neutral) — agent still works

8. **[ ] (Optional) Alert webhooks**
   - `DISCORD_WEBHOOK_URL` and/or `SLACK_WEBHOOK_URL`

### Code Changes Needed Before Mainnet
- **None for basic run** — code is already configured for `base-mainnet`
- **Nice to have**: Make `NETWORK` env var configurable (currently hardcoded to `base-mainnet` in `wallet/provider.ts`)
- **Nice to have**: USDC address should be network-aware if ever switching to testnet

### First Run Plan
1. `cp .env.example .env` → fill in API keys
2. `pnpm install && pnpm build`
3. Run locally first: `pnpm start` (or `node packages/agent/dist/runner.js`)
4. Watch logs — verify wallet connects, balance reads, subgraph polls
5. Wait for agent to find a concept scoring > 0.65 and auto-launch
6. Monitor positions via Discord/Slack alerts or `/api/portfolio` endpoint
7. Once stable, deploy to Railway

### Future Work
- [ ] Dashboard UI (Next.js monitoring interface)
- [ ] Advanced social signals (Farcaster frames, Twitter spaces)
- [ ] Multi-chain support

## Architecture Notes

- All modules use native `fetch` (no axios)
- x402 wraps fetch, so modules can swap in `x402Client.fetch` for paid APIs
- Identity registration is idempotent (checks `balanceOf` first)
- Dockerfile builds from monorepo root context (`packages/agent/Dockerfile`)
- Tests mock at the `globalThis.fetch` / viem client level — no real network calls
- Social signals use injectable `fetchFn` for testing — no global mock needed
- Auto-tuner uses iterative bounded normalization to guarantee weight constraints
- API server uses raw `http.createServer()` — no Express dependency
- All Phase 4 features are opt-in via env vars — no keys = existing behavior preserved

## Dependencies Added in Phase 3
- `@x402/fetch@^2.3.0`
- `@x402/evm@^2.3.0`

## Dependencies Added in Phase 5
- `better-sqlite3@^12.6.2` + `@types/better-sqlite3@^7.6.13`
- `@flaunch/sdk@^0.9.16`

## New Constants Added in Phase 4
- `SOCIAL_CONFIG` — cacheTTL, weights, defaultScore, API base URLs
- `AUTO_TUNER_CONFIG` — minSampleSize(10), adjustmentRate(0.05), weight bounds [0.1, 0.5], 6h interval
- `API_CONFIG` — $0.01/request, gating disabled by default

## New Constants Added in Phase 5
- `USDC_ADDRESS` — Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
