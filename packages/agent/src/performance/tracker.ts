import type { Position, PositionExitResult } from "../types.js";
import type { AnalyzerState } from "../contexts/analyzer.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PerformanceResult {
  concept: string;
  category: string;
  profitMultiple: number;
  performanceScore: number;
  factors?: {
    volumeScore: number;
    recencyScore: number;
    socialScore: number;
    noveltyScore: number;
  };
  exitAction: string;
  timestamp: number;
}

export interface CategoryPerformance {
  totalResults: number;
  avgScore: number;
  emaScore: number;
}

export interface PerformanceState {
  results: PerformanceResult[];
  categoryPerformance: Map<string, CategoryPerformance>;
  factorCorrelations: Map<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createPerformanceState(): PerformanceState {
  return {
    results: [],
    categoryPerformance: new Map(),
    factorCorrelations: new Map([
      ["volume", 0],
      ["recency", 0],
      ["social", 0],
      ["novelty", 0],
    ]),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a profit multiple to a 0-1 performance score.
 * - 0.5x (stop loss) = 0
 * - 1.0x (break-even) = 0.5
 * - 20x = 1.0
 */
export function calculatePerformanceScore(profitMultiple: number): number {
  if (profitMultiple <= 0.5) return 0;
  if (profitMultiple >= 20) return 1.0;
  if (profitMultiple <= 1) {
    // 0.5 → 0, 1.0 → 0.5 (linear)
    return (profitMultiple - 0.5) / 0.5 * 0.5;
  }
  // 1.0 → 0.5, 20 → 1.0 (log-scaled)
  return 0.5 + (Math.log(profitMultiple) / Math.log(20)) * 0.5;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT CATEGORIZATION
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  animal: ["dog", "cat", "frog", "pepe", "shib", "doge", "inu", "bear", "bull", "ape", "monkey", "bird", "fish", "whale"],
  ai: ["ai", "gpt", "agent", "bot", "neural", "brain", "compute", "model", "llm"],
  food: ["pizza", "burger", "taco", "sushi", "cake", "cook", "chef", "food", "eat"],
  culture: ["meme", "based", "chad", "wojak", "npc", "fren", "gm", "wagmi", "ngmi"],
  meta: ["coin", "token", "moon", "pump", "launch", "gem", "100x", "degen"],
};

export function categorizeConcept(concept: string): string {
  const lower = concept.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "other";
}

// ═══════════════════════════════════════════════════════════════════════════
// RECORD PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a position's performance after exit.
 * Updates EMA for the concept's category and factor correlations.
 */
export function recordPositionPerformance(
  perfState: PerformanceState,
  analyzerState: AnalyzerState,
  concept: string,
  position: Position,
  exit: PositionExitResult,
  factors?: { volumeScore: number; recencyScore: number; socialScore: number; noveltyScore: number }
): void {
  const profitMultiple = parseFloat(exit.multiple);
  const performanceScore = calculatePerformanceScore(profitMultiple);
  const category = categorizeConcept(concept);

  const result: PerformanceResult = {
    concept,
    category,
    profitMultiple,
    performanceScore,
    factors,
    exitAction: exit.action,
    timestamp: Date.now(),
  };

  perfState.results.push(result);

  // Update category EMA
  const existing = perfState.categoryPerformance.get(category);
  const alpha = 0.3;
  if (existing) {
    existing.totalResults++;
    existing.avgScore =
      (existing.avgScore * (existing.totalResults - 1) + performanceScore) /
      existing.totalResults;
    existing.emaScore = alpha * performanceScore + (1 - alpha) * existing.emaScore;
  } else {
    perfState.categoryPerformance.set(category, {
      totalResults: 1,
      avgScore: performanceScore,
      emaScore: performanceScore,
    });
  }

  // Update factor correlations if factor data is available
  if (factors) {
    updateFactorCorrelation(perfState, "volume", factors.volumeScore, performanceScore);
    updateFactorCorrelation(perfState, "recency", factors.recencyScore, performanceScore);
    updateFactorCorrelation(perfState, "social", factors.socialScore, performanceScore);
    updateFactorCorrelation(perfState, "novelty", factors.noveltyScore, performanceScore);
  }

  // Also update analyzer's historical performance
  analyzerState.historicalPerformance.set(
    concept.toLowerCase(),
    performanceScore
  );
}

function updateFactorCorrelation(
  state: PerformanceState,
  factor: string,
  factorScore: number,
  performanceScore: number
): void {
  const alpha = 0.2;
  const existing = state.factorCorrelations.get(factor) || 0;
  // Simple correlation approximation: how aligned is the factor with performance?
  // High factor score + high performance = positive correlation
  const alignment = factorScore * performanceScore;
  state.factorCorrelations.set(
    factor,
    alpha * alignment + (1 - alpha) * existing
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS RATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate recent success rate from performance history.
 * A "success" is a position that exited above break-even (multiple >= 1.0).
 */
export function getRecentSuccessRate(
  state: PerformanceState,
  windowSize: number = 10
): number {
  if (state.results.length === 0) return 0.5; // Neutral for no history

  const recent = state.results.slice(-windowSize);
  const successes = recent.filter((r) => r.profitMultiple >= 1.0).length;
  return successes / recent.length;
}
