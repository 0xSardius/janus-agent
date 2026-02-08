# Janus Agent — Development Scratchpad

## Current Status: Phase 4 Complete

**Date**: 2026-02-08
**Tests**: 269 passing (17 test files)
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

## What's Next: Phase 5 — Production Hardening

- [ ] Real end-to-end testing with funded CDP wallet on Base
- [ ] Replace Flaunch SDK stubs with real SDK calls
- [ ] Dashboard UI (Next.js monitoring interface)
- [ ] Advanced social signals (Farcaster frames, Twitter spaces)
- [ ] Multi-chain support
- [ ] Persistent state (currently all in-memory — lost on restart)

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

## New Constants Added in Phase 4
- `SOCIAL_CONFIG` — cacheTTL, weights, defaultScore, API base URLs
- `AUTO_TUNER_CONFIG` — minSampleSize(10), adjustmentRate(0.05), weight bounds [0.1, 0.5], 6h interval
- `API_CONFIG` — $0.01/request, gating disabled by default
