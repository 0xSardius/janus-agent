import type { PoolData, ScoredConcept, LaunchCandidate } from "../types.js";
import { SCORING_WEIGHTS, SAFETY_LIMITS } from "../constants.js";
import {
  analyzeConceptPotential,
  extractConceptsFromTokens,
  type ConceptAnalysis,
  type ExtractedConcepts,
} from "../ai/llm.js";
import type { SocialSignalProvider } from "../social/index.js";

// ═══════════════════════════════════════════════════════════════════════════
// ANALYZER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalyzerState {
  scoredConcepts: ScoredConcept[];
  launchQueue: LaunchCandidate[];
  historicalPerformance: Map<string, number>;
  llmAnalysisCache: Map<string, ConceptAnalysis>;
  extractedConcepts: ExtractedConcepts | null;
}

export function createAnalyzerState(): AnalyzerState {
  return {
    scoredConcepts: [],
    launchQueue: [],
    historicalPerformance: new Map(),
    llmAnalysisCache: new Map(),
    extractedConcepts: null,
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
  llmScore?: number;
}

export interface ScoreConceptOptions {
  socialSignalProvider?: SocialSignalProvider;
  weights?: { volume: number; recency: number; social: number; novelty: number };
}

/**
 * Score a concept based on multiple factors
 * Now includes LLM-powered analysis
 */
export async function scoreConcept(
  concept: string,
  relatedPools: PoolData[],
  historicalConcepts: Set<string>,
  options?: ScoreConceptOptions
): Promise<ScoredConcept> {
  const weights = options?.weights || SCORING_WEIGHTS;

  // Volume score: based on total volume of tokens with this concept
  const volumeScore = calculateVolumeScore(concept, relatedPools);

  // Recency score: prefer concepts from recently successful tokens
  const recencyScore = calculateRecencyScore(concept, relatedPools);

  // Social score: real data if provider available, else neutral
  const socialScore = options?.socialSignalProvider
    ? await options.socialSignalProvider.getScore(concept)
    : 0.5;

  // Novelty score: penalize overused concepts
  const noveltyScore = historicalConcepts.has(concept.toLowerCase()) ? 0.3 : 0.8;

  // Weighted total
  const score =
    volumeScore * weights.volume +
    recencyScore * weights.recency +
    socialScore * weights.social +
    noveltyScore * weights.novelty;

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
 * Score a concept with LLM analysis enhancement
 */
export async function scoreConceptWithLLM(
  state: AnalyzerState,
  concept: string,
  relatedPools: PoolData[],
  historicalConcepts: Set<string>,
  marketContext: { recentLaunches: number; topPerformers: string[]; hourlyVolume: string },
  options?: ScoreConceptOptions
): Promise<ScoredConcept> {
  // Get base score
  const baseScoredConcept = await scoreConcept(concept, relatedPools, historicalConcepts, options);

  // Check cache for LLM analysis
  let llmAnalysis = state.llmAnalysisCache.get(concept.toLowerCase());

  if (!llmAnalysis) {
    try {
      console.log(`[Analyzer] Running LLM analysis for "${concept}"...`);
      llmAnalysis = await analyzeConceptPotential(concept, marketContext);
      state.llmAnalysisCache.set(concept.toLowerCase(), llmAnalysis);
      console.log(`[Analyzer] LLM score: ${llmAnalysis.overallScore.toFixed(2)} - ${llmAnalysis.recommendation}`);
    } catch (error) {
      console.error(`[Analyzer] LLM analysis failed for "${concept}":`, error);
      // Fall back to base score
      return baseScoredConcept;
    }
  }

  // Blend LLM score with base score (60% base, 40% LLM)
  const blendedScore = baseScoredConcept.score * 0.6 + llmAnalysis.overallScore * 0.4;

  return {
    concept,
    score: Math.min(1, Math.max(0, blendedScore)),
    factors: {
      ...baseScoredConcept.factors!,
      llmScore: llmAnalysis.overallScore,
    },
  };
}

/**
 * Score multiple concepts and rank them
 */
export async function scoreConcepts(
  state: AnalyzerState,
  concepts: string[],
  relatedPools: PoolData[],
  options?: ScoreConceptOptions
): Promise<ScoredConcept[]> {
  const historicalConcepts = new Set(
    Array.from(state.historicalPerformance.keys())
  );

  const scored = await Promise.all(
    concepts.map((concept) =>
      scoreConcept(concept, relatedPools, historicalConcepts, options)
    )
  );

  // Sort by score descending
  const sorted = scored.sort((a, b) => b.score - a.score);
  state.scoredConcepts = sorted;

  return sorted;
}

/**
 * Score concepts with LLM enhancement (use for top candidates only to save API calls)
 */
export async function scoreConceptsWithLLM(
  state: AnalyzerState,
  concepts: string[],
  relatedPools: PoolData[],
  marketContext: { recentLaunches: number; topPerformers: string[]; hourlyVolume: string },
  llmAnalysisLimit: number = 5, // Only analyze top N candidates with LLM
  options?: ScoreConceptOptions
): Promise<ScoredConcept[]> {
  const historicalConcepts = new Set(
    Array.from(state.historicalPerformance.keys())
  );

  // First pass: quick scoring without LLM
  const quickScored = await Promise.all(
    concepts.map((concept) =>
      scoreConcept(concept, relatedPools, historicalConcepts, options)
    )
  );

  // Sort to find top candidates
  quickScored.sort((a, b) => b.score - a.score);

  // Second pass: LLM analysis for top candidates
  const topCandidates = quickScored.slice(0, llmAnalysisLimit);
  const enhancedScores = await Promise.all(
    topCandidates.map((sc) =>
      scoreConceptWithLLM(state, sc.concept, relatedPools, historicalConcepts, marketContext, options)
    )
  );

  // Combine enhanced top scores with remaining quick scores
  const remaining = quickScored.slice(llmAnalysisLimit);
  const allScored = [...enhancedScores, ...remaining];

  // Re-sort after LLM enhancement
  const sorted = allScored.sort((a, b) => b.score - a.score);
  state.scoredConcepts = sorted;

  return sorted;
}

/**
 * Extract and analyze concepts from token data using LLM
 */
export async function extractAndAnalyzeConcepts(
  state: AnalyzerState,
  pools: PoolData[]
): Promise<ExtractedConcepts> {
  const tokenData = pools.map((p) => ({
    symbol: p.memecoin.symbol,
    name: p.memecoin.name,
    volumeETH: p.volumeETH,
  }));

  console.log(`[Analyzer] Extracting concepts from ${tokenData.length} tokens with LLM...`);

  try {
    const extracted = await extractConceptsFromTokens(tokenData);
    state.extractedConcepts = extracted;

    console.log(`[Analyzer] Found ${extracted.concepts.length} concepts`);
    console.log(`[Analyzer] Emerging themes: ${extracted.emergingThemes.join(", ")}`);

    return extracted;
  } catch (error) {
    console.error("[Analyzer] LLM concept extraction failed:", error);
    // Return empty result on failure
    return { concepts: [], emergingThemes: [] };
  }
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

/**
 * Clear LLM analysis cache (call periodically to get fresh analysis)
 */
export function clearAnalysisCache(state: AnalyzerState): void {
  state.llmAnalysisCache.clear();
}

/**
 * Get cached LLM analysis for a concept
 */
export function getCachedAnalysis(
  state: AnalyzerState,
  concept: string
): ConceptAnalysis | undefined {
  return state.llmAnalysisCache.get(concept.toLowerCase());
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

/**
 * Legacy function for backwards compatibility
 * @deprecated Use scoreConceptWithLLM instead
 */
export async function analyzeConceptWithLLM(
  concept: string,
  context: string
): Promise<{ potential: number; reasoning: string }> {
  try {
    const analysis = await analyzeConceptPotential(concept, {
      recentLaunches: 0,
      topPerformers: [],
      hourlyVolume: "0",
    });
    return {
      potential: analysis.overallScore,
      reasoning: analysis.reasoning,
    };
  } catch {
    return { potential: 0.5, reasoning: "LLM analysis failed" };
  }
}
