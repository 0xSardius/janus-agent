# Janus Agent — Development Scratchpad

## Current Status: Phase 3 Complete

**Date**: 2026-02-08
**Tests**: 185 passing (9 test files)
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

**Runner Integration**
- Wallet readiness check at startup (warnings, not blocking)
- x402 client init
- ERC-8004 identity registration (optional, at startup)
- Graceful shutdown handlers
- Enhanced health endpoint

## What's Next: Phase 4 — Optimization

- [ ] Social signals (Twitter/Farcaster integration)
- [ ] Performance tracking and learning
- [ ] Agent-as-a-service API
- [ ] Real end-to-end testing with funded CDP wallet on Base

## Architecture Notes

- All modules use native `fetch` (no axios)
- x402 wraps fetch, so modules can swap in `x402Client.fetch` for paid APIs
- Identity registration is idempotent (checks `balanceOf` first)
- Dockerfile builds from monorepo root context (`packages/agent/Dockerfile`)
- Tests mock at the `globalThis.fetch` / viem client level — no real network calls

## Dependencies Added in Phase 3
- `@x402/fetch@^2.3.0`
- `@x402/evm@^2.3.0`
