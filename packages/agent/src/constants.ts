import { parseEther } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// POSITION STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

export const POSITION_STRATEGY = {
  // Buy amount per launch (conservative with $200 budget)
  buyAmountETH: parseEther("0.003"), // ~$8-10 per position

  // Portfolio exposure limits
  maxActivePositions: 10, // Max concurrent positions
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
  // Budget constraints
  maxDailyGasSpend: parseEther("0.5"), // ~$1,500 at $3k ETH
  maxSingleLaunchGas: parseEther("0.02"), // ~$60
  minEthBalance: parseEther("0.1"), // Reserve buffer

  // Launch rate limiting
  maxLaunchesPerDay: 5,
  minTimeBetweenLaunches: 2 * 60 * 60 * 1000, // 2 hours

  // Quality thresholds
  minConceptScore: 0.65,
  minConfidenceThreshold: 0.7,

  // Position management
  maxBuyPerToken: parseEther("0.003"), // ~$8-10 per position
  maxActivePositions: 10, // Max concurrent positions
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
