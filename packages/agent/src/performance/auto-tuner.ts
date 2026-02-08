import { AUTO_TUNER_CONFIG } from "../constants.js";
import type { PerformanceState } from "./tracker.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringWeights {
  volume: number;
  recency: number;
  social: number;
  novelty: number;
}

export interface TunerConfig {
  minSampleSize?: number;
  adjustmentRate?: number;
  minWeight?: number;
  maxWeight?: number;
  tuneIntervalMs?: number;
}

export interface TuneResult {
  tuned: boolean;
  previousWeights: ScoringWeights;
  newWeights: ScoringWeights;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOULD TUNE
// ═══════════════════════════════════════════════════════════════════════════

export function shouldTune(
  perfState: PerformanceState,
  lastTuneTimestamp: number,
  config?: TunerConfig
): boolean {
  const minSamples = config?.minSampleSize ?? AUTO_TUNER_CONFIG.minSampleSize;
  const interval = config?.tuneIntervalMs ?? AUTO_TUNER_CONFIG.tuneIntervalMs;

  if (perfState.results.length < minSamples) return false;
  if (Date.now() - lastTuneTimestamp < interval) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATE WEIGHT ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adjust weights based on factor correlations with profit.
 * Factors with higher correlation to profitable outcomes get more weight.
 * Changes are bounded and weights always sum to 1.0.
 */
export function calculateWeightAdjustments(
  currentWeights: ScoringWeights,
  correlations: Map<string, number>,
  config?: TunerConfig
): TuneResult {
  const adjustmentRate = config?.adjustmentRate ?? AUTO_TUNER_CONFIG.adjustmentRate;
  const minWeight = config?.minWeight ?? AUTO_TUNER_CONFIG.minWeight;
  const maxWeight = config?.maxWeight ?? AUTO_TUNER_CONFIG.maxWeight;

  const previousWeights = { ...currentWeights };

  // Get correlation values
  const volCorr = correlations.get("volume") || 0;
  const recCorr = correlations.get("recency") || 0;
  const socCorr = correlations.get("social") || 0;
  const novCorr = correlations.get("novelty") || 0;

  const totalCorr = volCorr + recCorr + socCorr + novCorr;

  // If no meaningful correlation data, don't tune
  if (totalCorr === 0) {
    return {
      tuned: false,
      previousWeights,
      newWeights: { ...currentWeights },
      reason: "No correlation data available",
    };
  }

  // Calculate desired direction of adjustment
  // Higher correlation → should get more weight
  const avgCorr = totalCorr / 4;
  const volDelta = (volCorr - avgCorr) * adjustmentRate;
  const recDelta = (recCorr - avgCorr) * adjustmentRate;
  const socDelta = (socCorr - avgCorr) * adjustmentRate;
  const novDelta = (novCorr - avgCorr) * adjustmentRate;

  // Apply deltas with bounds, then normalize respecting bounds
  const newWeights: ScoringWeights = boundedNormalize(
    {
      volume: currentWeights.volume + volDelta,
      recency: currentWeights.recency + recDelta,
      social: currentWeights.social + socDelta,
      novelty: currentWeights.novelty + novDelta,
    },
    minWeight,
    maxWeight
  );

  return {
    tuned: true,
    previousWeights,
    newWeights,
    reason: `Adjusted based on ${correlations.size} factor correlations`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize weights to sum to 1.0 while respecting min/max bounds.
 * Iteratively clamps and redistributes excess until stable.
 */
function boundedNormalize(
  weights: ScoringWeights,
  minWeight: number,
  maxWeight: number
): ScoringWeights {
  const keys: (keyof ScoringWeights)[] = ["volume", "recency", "social", "novelty"];
  const values = keys.map((k) => weights[k]);

  // Normalize to sum=1 first
  const total = values.reduce((s, v) => s + v, 0);
  let normalized = total === 0
    ? [0.25, 0.25, 0.25, 0.25]
    : values.map((v) => v / total);

  // Iteratively enforce bounds
  for (let iter = 0; iter < 10; iter++) {
    let excess = 0;
    let freeCount = 0;

    for (let i = 0; i < 4; i++) {
      if (normalized[i] < minWeight) {
        excess += normalized[i] - minWeight;
        normalized[i] = minWeight;
      } else if (normalized[i] > maxWeight) {
        excess += normalized[i] - maxWeight;
        normalized[i] = maxWeight;
      } else {
        freeCount++;
      }
    }

    if (Math.abs(excess) < 1e-10 || freeCount === 0) break;

    // Distribute excess among unclamped weights
    const perFree = excess / freeCount;
    for (let i = 0; i < 4; i++) {
      if (normalized[i] > minWeight && normalized[i] < maxWeight) {
        normalized[i] += perFree;
      }
    }
  }

  return {
    volume: normalized[0],
    recency: normalized[1],
    social: normalized[2],
    novelty: normalized[3],
  };
}

export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = weights.volume + weights.recency + weights.social + weights.novelty;
  if (total === 0) {
    return { volume: 0.25, recency: 0.25, social: 0.25, novelty: 0.25 };
  }
  return {
    volume: weights.volume / total,
    recency: weights.recency / total,
    social: weights.social / total,
    novelty: weights.novelty / total,
  };
}
