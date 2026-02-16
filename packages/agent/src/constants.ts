import { parseEther } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// POSITION STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

export const POSITION_STRATEGY = {
  // Buy amount per launch ($100 budget at ~$2k/ETH)
  buyAmountETH: parseEther("0.0025"), // ~$5 per position

  // Portfolio exposure limits
  maxActivePositions: 5, // Max concurrent positions
  maxPortfolioExposure: 0.25, // Never >25% of wallet in positions

  // Staged exit strategy - sell in tranches as price increases
  sellTranches: [
    { triggerMultiple: 3, sellPercent: 25 }, // Sell 25% at 3x
    { triggerMultiple: 5, sellPercent: 25 }, // Sell 25% at 5x
    { triggerMultiple: 10, sellPercent: 25 }, // Sell 25% at 10x
    { triggerMultiple: 20, sellPercent: 25 }, // Sell remaining at 20x
  ],

  // Risk management
  stopLossMultiple: 0.5, // Sell all if drops 50%
  maxHoldDuration: 7 * 24 * 60 * 60 * 1000, // 7 days max hold
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY LIMITS
// ═══════════════════════════════════════════════════════════════════════════

export const SAFETY_LIMITS = {
  // Budget constraints ($100 at ~$2k/ETH ≈ 0.05 ETH)
  maxDailyGasSpend: parseEther("0.01"), // ~$20/day gas cap
  maxSingleLaunchGas: parseEther("0.005"), // ~$10 per launch
  minEthBalance: parseEther("0.005"), // ~$10 emergency floor

  // Launch rate limiting
  maxLaunchesPerDay: 3,
  minTimeBetweenLaunches: 2 * 60 * 60 * 1000, // 2 hours

  // Quality thresholds
  minConceptScore: 0.65,
  minConfidenceThreshold: 0.7,

  // Position management
  maxBuyPerToken: parseEther("0.0025"), // ~$5 per position
  maxActivePositions: 5, // Max concurrent positions
  maxPortfolioExposure: 0.25, // Never >25% of wallet in positions
  stopLossMultiple: 0.5, // Sell all if drops 50%
  maxHoldDays: 7, // Auto-exit after 7 days

  // Circuit breakers
  maxConsecutiveFailures: 3,
  pauseOnHighGas: 100, // gwei - pause if gas > 100 gwei

  // Emergency stop
  emergencyStopFile: "/tmp/agent-stop", // Touch this file to stop agent
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SCORING WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════

export const SCORING_WEIGHTS = {
  volume: 0.3,
  recency: 0.25,
  social: 0.25,
  novelty: 0.2,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// POLLING INTERVALS
// ═══════════════════════════════════════════════════════════════════════════

export const INTERVALS = {
  mainLoopMs: 60_000, // Main loop runs every 60 seconds
  pollIntervalMs: 30_000, // Poll subgraph every 30 seconds
  feeClaimIntervalMs: 24 * 60 * 60 * 1000, // Claim fees daily
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// x402 MICROPAYMENT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const X402_CONFIG = {
  maxPaymentPerRequestUSD: 0.10, // Max $0.10 per request
  maxDailyPaymentsUSD: 5.00, // Max $5.00/day in micropayments
  facilitatorUrl: "https://x402.org/facilitator", // Default facilitator
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// ERC-8004 ON-CHAIN IDENTITY CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL SIGNALS CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const SOCIAL_CONFIG = {
  cacheTTLMs: 5 * 60 * 1000, // 5-minute cache
  farcasterWeight: 0.6,
  twitterWeight: 0.4,
  defaultScore: 0.5, // Neutral when no APIs available
  farcasterBaseUrl: "https://api.neynar.com/v2",
  twitterBaseUrl: "https://api.twitter.com/2",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-TUNER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const AUTO_TUNER_CONFIG = {
  minSampleSize: 10, // Minimum results before tuning
  adjustmentRate: 0.05, // Max weight change per tune cycle
  minWeight: 0.1, // Minimum allowed weight
  maxWeight: 0.5, // Maximum allowed weight
  tuneIntervalMs: 6 * 60 * 60 * 1000, // 6 hours between tunes
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// API CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const API_CONFIG = {
  pricePerRequestUSD: 0.01, // $0.01 per API request
  enableGatingDefault: false, // Disabled by default
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

export const ERC8004_CONFIG = {
  // Registry addresses
  ethereumRegistry: "0x8004e3e07100dFbE22800a5025b1A8a2037aa65C" as `0x${string}`,
  // Base registry can be overridden via env var
  defaultBaseRegistry: "0x8004e3e07100dFbE22800a5025b1A8a2037aa65C" as `0x${string}`,

  // Agent metadata
  agentName: "Janus Token Launcher",
  agentDescription: "Autonomous meme token launcher agent on Base via Flaunch",
} as const;
