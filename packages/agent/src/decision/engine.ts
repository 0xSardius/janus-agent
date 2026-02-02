import { SAFETY_LIMITS, SCORING_WEIGHTS } from "../constants.js";
import type {
  AgentState,
  LaunchDecision,
  MarketConditions,
  ScoredConcept,
} from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// DECISION THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const VOLUME_THRESHOLD = BigInt(10) * BigInt(1e18); // 10 ETH hourly
const SATURATION_THRESHOLD = 20; // Max recent launches before market is "saturated"
const MIN_COOLDOWN_MS = SAFETY_LIMITS.minTimeBetweenLaunches;

// ═══════════════════════════════════════════════════════════════════════════
// DECISION FACTORS
// ═══════════════════════════════════════════════════════════════════════════

interface DecisionFactors {
  // Budget constraints
  hasEnoughGas: boolean;
  hasEnoughUSDC: boolean;

  // Recent performance
  recentSuccessRate: number;

  // Market timing
  isHighActivity: boolean;
  isNotOversaturated: boolean;

  // Concept quality
  topConceptScore: number;

  // Cooldown
  timeSinceLastLaunch: number;
  minCooldownMet: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make a launch decision based on current state and market conditions
 */
export async function makeDecision(
  currentState: AgentState,
  marketConditions: MarketConditions
): Promise<LaunchDecision> {
  // Calculate decision factors
  const factors = calculateFactors(currentState, marketConditions);

  // Weighted decision matrix
  const score =
    (factors.hasEnoughGas ? 0.15 : 0) +
    (factors.hasEnoughUSDC ? 0.1 : 0) +
    factors.recentSuccessRate * 0.2 +
    (factors.isHighActivity ? 0.15 : 0) +
    (factors.isNotOversaturated ? 0.1 : 0) +
    factors.topConceptScore * 0.2 +
    (factors.minCooldownMet ? 0.1 : 0);

  // Determine if we should launch
  const shouldLaunch =
    score > SAFETY_LIMITS.minConceptScore &&
    factors.hasEnoughGas &&
    factors.minCooldownMet;

  // Get top concept if score is high enough
  const topConcept = currentState.scoredConcepts[0];
  const suggestedConcept =
    topConcept && topConcept.score >= SAFETY_LIMITS.minConceptScore
      ? topConcept.concept
      : undefined;

  return {
    shouldLaunch,
    confidence: Math.min(1, Math.max(0, score)),
    reasoning: generateReasoning(factors, score),
    suggestedConcept,
    suggestedTiming: determineOptimalTiming(marketConditions, factors),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTOR CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateFactors(
  state: AgentState,
  market: MarketConditions
): DecisionFactors {
  const timeSinceLastLaunch = Date.now() - state.lastLaunchTimestamp;

  return {
    // Budget constraints
    hasEnoughGas: state.ethBalance > SAFETY_LIMITS.minEthBalance,
    hasEnoughUSDC: state.usdcBalance > BigInt(10) * BigInt(1e6), // 10 USDC

    // Recent performance
    recentSuccessRate: calculateRecentSuccessRate(state.launchedTokens),

    // Market timing
    isHighActivity: market.hourlyVolume > VOLUME_THRESHOLD,
    isNotOversaturated: market.recentLaunches < SATURATION_THRESHOLD,

    // Concept quality
    topConceptScore: state.scoredConcepts[0]?.score || 0,

    // Cooldown
    timeSinceLastLaunch,
    minCooldownMet: timeSinceLastLaunch > MIN_COOLDOWN_MS,
  };
}

function calculateRecentSuccessRate(
  launchedTokens: AgentState["launchedTokens"]
): number {
  if (launchedTokens.length === 0) return 0.5; // Neutral for no history

  // Look at last 10 launches
  const recent = launchedTokens.slice(-10);

  // For now, assume all launches are "successful" if they completed
  // Phase 2: Track actual performance metrics
  const successCount = recent.length;
  return successCount / Math.max(recent.length, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// REASONING GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateReasoning(factors: DecisionFactors, score: number): string {
  const reasons: string[] = [];

  if (!factors.hasEnoughGas) {
    reasons.push("Low ETH balance");
  }
  if (!factors.minCooldownMet) {
    const waitMins = Math.ceil(
      (MIN_COOLDOWN_MS - factors.timeSinceLastLaunch) / 60000
    );
    reasons.push(`Cooldown: ${waitMins}m remaining`);
  }
  if (!factors.isHighActivity) {
    reasons.push("Low market activity");
  }
  if (!factors.isNotOversaturated) {
    reasons.push("Market saturated");
  }
  if (factors.topConceptScore < SAFETY_LIMITS.minConceptScore) {
    reasons.push(`Concept score too low: ${factors.topConceptScore.toFixed(2)}`);
  }

  if (reasons.length === 0) {
    return `All conditions met. Score: ${score.toFixed(2)}`;
  }

  return `Score: ${score.toFixed(2)}. Issues: ${reasons.join(", ")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

function determineOptimalTiming(
  market: MarketConditions,
  factors: DecisionFactors
): LaunchDecision["suggestedTiming"] {
  // If cooldown not met, wait
  if (!factors.minCooldownMet) {
    return "wait_1h";
  }

  // If market is very active, launch immediately
  if (market.hourlyVolume > VOLUME_THRESHOLD * BigInt(2)) {
    return "immediate";
  }

  // If it's peak hours (US evening = UTC 00:00-04:00), launch now
  const hour = new Date().getUTCHours();
  const isPeakHours = hour >= 0 && hour <= 4;

  if (isPeakHours && factors.isHighActivity) {
    return "immediate";
  }

  // Otherwise suggest waiting for peak hours
  if (!isPeakHours) {
    return "wait_peak_hours";
  }

  return "immediate";
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET CONDITIONS HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current market conditions from subgraph
 */
export async function getMarketConditions(): Promise<MarketConditions> {
  const subgraphUrl = process.env.FLAUNCH_SUBGRAPH_URL;

  if (!subgraphUrl) {
    // Return conservative defaults if no subgraph
    return {
      hourlyVolume: BigInt(0),
      recentLaunches: 0,
      gasPrice: BigInt(0),
      timestamp: Date.now(),
    };
  }

  try {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

    const query = `
      query MarketConditions($since: Int!) {
        pools(where: { createdAt_gte: $since }) {
          id
          volumeETH
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { since: oneHourAgo } }),
    });

    const result = await response.json() as { data?: { pools?: Array<{ id: string; volumeETH: string }> } };
    const pools = result.data?.pools || [];

    // Calculate hourly volume
    const hourlyVolume = pools.reduce(
      (sum: bigint, p: { volumeETH: string }) =>
        sum + BigInt(Math.floor(parseFloat(p.volumeETH) * 1e18)),
      BigInt(0)
    );

    return {
      hourlyVolume,
      recentLaunches: pools.length,
      gasPrice: BigInt(0), // Fetched separately in safety checks
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Failed to fetch market conditions:", error);
    return {
      hourlyVolume: BigInt(0),
      recentLaunches: 0,
      gasPrice: BigInt(0),
      timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { type DecisionFactors };
