# Janus Agent - Architecture Diagram

## Main Loop Workflow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           JANUS AGENT - MAIN LOOP                               │
│                              (runner.ts)                                        │
│                         Cycles every 60 seconds                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1. SAFETY CHECK                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • ETH balance > 0.1 ETH?                                               │   │
│  │  • Gas price < 100 gwei?                                                │   │
│  │  • Daily gas spend < 0.5 ETH?                                           │   │
│  │  • Consecutive failures < 3?                                            │   │
│  │  • Daily launch count < 5?                                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                          │ FAIL: Sleep & retry                                  │
│                          ▼ PASS                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  2. MONITOR CONTEXT                                                             │
│  ┌──────────────────────┐      ┌──────────────────────────────────────────┐    │
│  │  Flaunch Subgraph    │─────▶│  pollNewTokens()                         │    │
│  │  (GraphQL API)       │      │  • Fetch recent pools (last 24h)         │    │
│  └──────────────────────┘      │  • Track new vs seen tokens              │    │
│                                │  • Store in recentTokens[]               │    │
│                                └──────────────────────────────────────────┘    │
│                                                 │                               │
│                                                 ▼                               │
│                                ┌──────────────────────────────────────────┐    │
│                                │  extractTrendingConcepts()               │    │
│                                │  • Parse token names/symbols             │    │
│                                │  • Identify recurring themes             │    │
│                                │  • Return concept strings[]              │    │
│                                └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ concepts[]
┌─────────────────────────────────────────────────────────────────────────────────┐
│  3. MARKET CONDITIONS                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  getMarketConditions()                                                  │   │
│  │  • Hourly volume (ETH)                                                  │   │
│  │  • Recent launch count                                                  │   │
│  │  • Current gas price                                                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  4. ANALYZER CONTEXT                                                            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    ENABLE_LLM_SCORING = false                           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  scoreConcepts() - Base Scoring                                 │   │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │   │   │
│  │  │  │ Volume 30%  │ │ Recency 25% │ │ Social 25%  │ │Novelty 20%│ │   │   │
│  │  │  │ ETH traded  │ │ Age of      │ │ (placeholder│ │ Not used  │ │   │   │
│  │  │  │ on concept  │ │ related     │ │  = 0.5)     │ │ before?   │ │   │   │
│  │  │  │ tokens      │ │ tokens      │ │             │ │           │ │   │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    ENABLE_LLM_SCORING = true                            │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  scoreConceptsWithLLM() - Enhanced Scoring                      │   │   │
│  │  │                                                                 │   │   │
│  │  │  Step 1: Quick score ALL concepts (base scoring)                │   │   │
│  │  │                         │                                       │   │   │
│  │  │                         ▼                                       │   │   │
│  │  │  Step 2: Take top 5 candidates                                  │   │   │
│  │  │                         │                                       │   │   │
│  │  │                         ▼                                       │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  Anthropic Claude (analyzeConceptPotential)             │   │   │   │
│  │  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │   │   │
│  │  │  │  │ Virality    │ │ Timing      │ │ Saturation      │   │   │   │   │
│  │  │  │  │ Score       │ │ Score       │ │ Risk            │   │   │   │   │
│  │  │  │  │ (0-1)       │ │ (0-1)       │ │ (0-1)           │   │   │   │   │
│  │  │  │  └─────────────┘ └─────────────┘ └─────────────────┘   │   │   │   │
│  │  │  │  → overallScore + reasoning + recommendation           │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │   │
│  │  │                         │                                       │   │   │
│  │  │                         ▼                                       │   │   │
│  │  │  Step 3: Blend scores (60% base + 40% LLM)                      │   │   │
│  │  │                         │                                       │   │   │
│  │  │                         ▼                                       │   │   │
│  │  │  Cache LLM results (cleared every 12 cycles)                    │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Output: ScoredConcept[] sorted by score descending                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ scoredConcepts[]
┌─────────────────────────────────────────────────────────────────────────────────┐
│  5. DECISION ENGINE                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  makeDecision(agentState, marketConditions)                             │   │
│  │                                                                         │   │
│  │  Weighted Score Calculation:                                            │   │
│  │  ┌───────────────────┬────────┐                                        │   │
│  │  │ Has enough gas    │  15%   │                                        │   │
│  │  │ Has enough USDC   │  10%   │                                        │   │
│  │  │ Recent success    │  20%   │                                        │   │
│  │  │ High activity     │  15%   │                                        │   │
│  │  │ Not saturated     │  10%   │                                        │   │
│  │  │ Top concept score │  20%   │                                        │   │
│  │  │ Cooldown met      │  10%   │                                        │   │
│  │  └───────────────────┴────────┘                                        │   │
│  │                                                                         │   │
│  │  Launch if: score > 0.65 AND hasGas AND cooldownMet                     │   │
│  │  Timing: immediate | wait_1h | wait_peak_hours                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                    shouldLaunch            shouldLaunch
                      = false                 = true
                          │                       │
                          ▼                       ▼
                   Skip to Step 7         Continue to Step 6
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  6. CREATOR CONTEXT                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  generateTokenConcept(baseConcept, iterationType, style)                │   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  ANTHROPIC CLAUDE (generateObject)                              │   │   │
│  │  │                                                                 │   │   │
│  │  │  Input:                                                         │   │   │
│  │  │  • baseConcept: "doge"                                          │   │   │
│  │  │  • iterationType: derivative | mashup | meta | original         │   │   │
│  │  │  • recentSuccessfulTokens[]                                     │   │   │
│  │  │                                                                 │   │   │
│  │  │  Output (structured):                                           │   │   │
│  │  │  • name: "Super Doge Inu"                                       │   │   │
│  │  │  • symbol: "SDINU" (max 6 chars)                                │   │   │
│  │  │  • description: "The dogest doge..."                            │   │   │
│  │  │  • imagePrompt: "A muscular shiba inu..."                       │   │   │
│  │  │  • reasoning: "Combines trending..."                            │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                         │   │
│  │                              ▼                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  FAL.AI FLUX SCHNELL (generateTokenImage)                       │   │   │
│  │  │                                                                 │   │   │
│  │  │  Style Presets:                                                 │   │   │
│  │  │  • meme: "cartoon style, funny, viral meme aesthetic"           │   │   │
│  │  │  • logo: "minimalist, clean, professional crypto logo"          │   │   │
│  │  │  • mascot: "cute character, mascot style, friendly"             │   │   │
│  │  │  • abstract: "abstract art, geometric, modern"                  │   │   │
│  │  │                                                                 │   │   │
│  │  │  Output: 512x512 PNG → base64 encoded                           │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Output: TokenMetadata { name, symbol, description, base64Image }               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  6b. LAUNCHER CONTEXT                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  launchToken(metadata, publicClient, walletClient, walletAddress)       │   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  CDP WALLET (AgentKit)                                          │   │   │
│  │  │  • TEE-protected signing                                        │   │   │
│  │  │  • API-based (no private keys in env)                           │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                         │   │
│  │                              ▼                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  FLAUNCH SDK                                                    │   │   │
│  │  │  flaunch.flaunchIPFS({                                          │   │   │
│  │  │    name, symbol,                                                │   │   │
│  │  │    fairLaunchPercent: 0,                                        │   │   │
│  │  │    fairLaunchDuration: 30 min,                                  │   │   │
│  │  │    initialMarketCapUSD: 10,000,                                 │   │   │
│  │  │    creator: agentWallet,                                        │   │   │
│  │  │    creatorFeeAllocationPercent: 100,                            │   │   │
│  │  │    metadata: { base64Image, description }                       │   │   │
│  │  │  })                                                             │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                         │   │
│  │                              ▼                                         │   │
│  │  Output: { txHash, tokenAddress, poolId }                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼ SUCCESS                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  POSITION MANAGER - buyOwnToken()                                       │   │
│  │  • Buy 0.003 ETH worth of own token                                     │   │
│  │  • Create Position record                                               │   │
│  │  • Track entry price, cost basis                                        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  7. POSITION MANAGER - Monitor Existing Positions                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  monitorPositions() - Every cycle for ALL active positions              │   │
│  │                                                                         │   │
│  │  For each position:                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  1. Get current price from Flaunch pool                         │   │   │
│  │  │  2. Calculate current multiple (currentPrice / entryPrice)      │   │   │
│  │  │                                                                 │   │   │
│  │  │  EXIT CONDITIONS:                                               │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  STAGED PROFIT TAKING:                                  │   │   │   │
│  │  │  │  • 3x  → Sell 25%                                       │   │   │   │
│  │  │  │  • 5x  → Sell 25%                                       │   │   │   │
│  │  │  │  • 10x → Sell 25%                                       │   │   │   │
│  │  │  │  • 20x → Sell 25% (fully exited)                        │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  STOP LOSS:                                             │   │   │   │
│  │  │  │  • 0.5x → Sell 100% (cut losses)                        │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  TIME LIMIT:                                            │   │   │   │
│  │  │  │  • 7 days held → Sell 100% (free up capital)            │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  8. ALERTS (Discord/Slack webhooks)                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Events:                                                                │   │
│  │  • Agent started                                                        │   │
│  │  • Token launched (symbol, tx, address)                                 │   │
│  │  • Position opened (symbol, cost, tokens)                               │   │
│  │  • Position exit (symbol, action, multiple, ETH received)               │   │
│  │  • Errors                                                               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                              Sleep 60 seconds
                                      │
                                      ▼
                              ┌───────────────┐
                              │  Next Cycle   │
                              └───────────────┘
```

## Data Flow Summary

```
EXTERNAL SERVICES:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Flaunch         │  │ Anthropic       │  │ Fal.ai          │  │ CDP (Coinbase)  │
│ Subgraph        │  │ Claude          │  │ Flux Schnell    │  │ AgentKit        │
│                 │  │                 │  │                 │  │                 │
│ • Pool data     │  │ • Concept       │  │ • Image         │  │ • Wallet        │
│ • Token info    │  │   analysis      │  │   generation    │  │   signing       │
│ • Volume stats  │  │ • Token name    │  │ • 512x512 PNG   │  │ • TEE protected │
│                 │  │   generation    │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
        │                    │                    │                    │
        └────────────────────┴────────────────────┴────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │     JANUS AGENT         │
                        │   (Base Mainnet)        │
                        └─────────────────────────┘
```

## Context State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AgentContexts                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │ MonitorState    │    │ AnalyzerState   │    │ CreatorState    │             │
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────┤             │
│  │ recentTokens[]  │───▶│ scoredConcepts[]│───▶│ pendingTokens[] │             │
│  │ seenPoolIds     │    │ launchQueue[]   │    │ recentGens[]    │             │
│  │ lastPollTime    │    │ llmCache        │    │ usedConcepts    │             │
│  └─────────────────┘    │ histPerformance │    └─────────────────┘             │
│                         └─────────────────┘                                     │
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                                    │
│  │ LauncherState   │    │ PositionMgrState│                                    │
│  ├─────────────────┤    ├─────────────────┤                                    │
│  │ launchedTokens[]│◀───│ activePositions │                                    │
│  │ dailyLaunchCnt  │    │ exitedPositions │                                    │
│  │ lastLaunchTime  │    │ totalPnL        │                                    │
│  │ dailyGasSpent   │    └─────────────────┘                                    │
│  └─────────────────┘                                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
packages/agent/src/
├── runner.ts                 # Main loop orchestrator
├── contexts/
│   ├── monitor.ts           # Step 2: Flaunch polling
│   ├── analyzer.ts          # Step 4: Concept scoring
│   ├── creator.ts           # Step 6: Token generation
│   ├── launcher.ts          # Step 6b: Flaunch SDK
│   └── position-manager.ts  # Step 7: Position management
├── decision/
│   └── engine.ts            # Step 5: Launch decisions
├── ai/
│   ├── llm.ts               # Anthropic Claude integration
│   └── image.ts             # Fal.ai Flux integration
├── wallet/
│   └── provider.ts          # CDP AgentKit setup
├── safety.ts                # Step 1: Safety checks
├── alerts.ts                # Step 8: Notifications
├── constants.ts             # Configuration values
└── types.ts                 # TypeScript definitions
```
