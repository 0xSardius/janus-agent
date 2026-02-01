import type { PoolData, ScoredConcept, LaunchCandidate } from "../types.js";
import { SCORING_WEIGHTS, SAFETY_LIMITS } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// ANALYZER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalyzerState {
  scoredConcepts: ScoredConcept[];
  launchQueue: LaunchCandidate[];
  historicalPerformance: Map<string, number>;
}

export function createAnalyzerState(): AnalyzerState {
  return {
    scoredConcepts: [],
    launchQueue: [],
    historicalPerformance: new Map(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConceptScoreFactors {
  volumeScore: number;
  recencyScore: number;
  socialScore: number;
  noveltyScore: number;
}

/**
 * Score a concept based on multiple factors
 * Phase 2: Add LLM-powered analysis and social signal integration
 */
export async function scoreConcept(
  concept: string,
  relatedPools: PoolData[],
  historicalConcepts: Set<string>
): Promise<ScoredConcept> {
  // Volume score: based on total volume of tokens with this concept
  const volumeScore = calculateVolumeScore(concept, relatedPools);

  // Recency score: prefer concepts from recently successful tokens
  const recencyScore = calculateRecencyScore(concept, relatedPools);

  // Social score: placeholder for Phase 2 Twitter/Farcaster integration
  const socialScore = 0.5; // Default neutral score

  // Novelty score: penalize overused concepts
  const noveltyScore = historicalConcepts.has(concept.toLowerCase()) ? 0.3 : 0.8;

  // Weighted total
  const score =
    volumeScore * SCORING_WEIGHTS.volume +
    recencyScore * SCORING_WEIGHTS.recency +
    socialScore * SCORING_WEIGHTS.social +
    noveltyScore * SCORING_WEIGHTS.novelty;

  return {
    concept,
    score: Math.min(1, Math.max(0, score)),
    factors: {
      volumeScore,
      recencyScore,
      socialScore,
      noveltyScore,
    },
  };
}

/**
 * Score multiple concepts and rank them
 */
export async function scoreConcepts(
  state: AnalyzerState,
  concepts: string[],
  relatedPools: PoolData[]
): Promise<ScoredConcept[]> {
  const historicalConcepts = new Set(
    Array.from(state.historicalPerformance.keys())
  );

  const scored = await Promise.all(
    concepts.map((concept) =>
      scoreConcept(concept, relatedPools, historicalConcepts)
    )
  );

  // Sort by score descending
  const sorted = scored.sort((a, b) => b.score - a.score);
  state.scoredConcepts = sorted;

  return sorted;
}

/**
 * Select the best concept for launch if it meets threshold
 */
export function selectLaunchCandidate(
  state: AnalyzerState,
  minScore: number = SAFETY_LIMITS.minConceptScore
): LaunchCandidate | null {
  const candidate = state.scoredConcepts.find((c) => c.score >= minScore);

  if (candidate) {
    const launchCandidate: LaunchCandidate = {
      concept: candidate.concept,
      selectedAt: Date.now(),
      score: candidate.score,
    };

    state.launchQueue.push(launchCandidate);
    return launchCandidate;
  }

  return null;
}

/**
 * Get the next candidate from the launch queue
 */
export function getNextCandidate(state: AnalyzerState): LaunchCandidate | null {
  return state.launchQueue.shift() || null;
}

/**
 * Record performance for learning
 */
export function recordPerformance(
  state: AnalyzerState,
  concept: string,
  performanceScore: number
): void {
  const existing = state.historicalPerformance.get(concept.toLowerCase()) || 0;
  // Exponential moving average
  const alpha = 0.3;
  const newScore = alpha * performanceScore + (1 - alpha) * existing;
  state.historicalPerformance.set(concept.toLowerCase(), newScore);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateVolumeScore(concept: string, pools: PoolData[]): number {
  const conceptLower = concept.toLowerCase();

  // Find pools related to this concept
  const relatedPools = pools.filter((p) => {
    const name = p.memecoin.name.toLowerCase();
    const symbol = p.memecoin.symbol.toLowerCase();
    return name.includes(conceptLower) || symbol.includes(conceptLower);
  });

  if (relatedPools.length === 0) return 0.3; // Base score for new concepts

  // Sum volume
  const totalVolume = relatedPools.reduce(
    (sum, p) => sum + parseFloat(p.volumeETH),
    0
  );

  // Normalize: log scale, 1 ETH = 0.5, 100 ETH = 1.0
  return Math.min(1, 0.5 + Math.log10(totalVolume + 1) / 4);
}

function calculateRecencyScore(concept: string, pools: PoolData[]): number {
  const conceptLower = concept.toLowerCase();
  const now = Date.now() / 1000;

  const relatedPools = pools.filter((p) => {
    const name = p.memecoin.name.toLowerCase();
    const symbol = p.memecoin.symbol.toLowerCase();
    return name.includes(conceptLower) || symbol.includes(conceptLower);
  });

  if (relatedPools.length === 0) return 0.5;

  // Find most recent pool
  const mostRecent = Math.max(...relatedPools.map((p) => p.createdAt));
  const ageHours = (now - mostRecent) / 3600;

  // Score: 1.0 for <1h old, decaying to 0.3 at 48h
  if (ageHours < 1) return 1.0;
  if (ageHours > 48) return 0.3;
  return 1.0 - (ageHours / 48) * 0.7;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 STUBS (To be implemented)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TODO Phase 2: Fetch social signals from Twitter/Farcaster
 */
export async function fetchSocialSignals(
  _concept: string
): Promise<{ mentions: number; sentiment: number }> {
  // Placeholder - integrate with x402-gated social APIs
  return { mentions: 0, sentiment: 0.5 };
}

/**
 * TODO Phase 2: Use LLM to analyze concept potential
 */
export async function analyzeConceptWithLLM(
  _concept: string,
  _context: string
): Promise<{ potential: number; reasoning: string }> {
  // Placeholder - integrate with OpenAI/Dreams Router
  return { potential: 0.5, reasoning: "LLM analysis not implemented" };
}
