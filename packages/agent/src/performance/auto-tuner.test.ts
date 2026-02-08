import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shouldTune,
  calculateWeightAdjustments,
  normalizeWeights,
  type ScoringWeights,
} from "./auto-tuner.js";
import { createPerformanceState } from "./tracker.js";

describe("shouldTune", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when not enough samples", () => {
    const state = createPerformanceState();
    state.results = Array(5).fill({ concept: "X", category: "other", profitMultiple: 1, performanceScore: 0.5, exitAction: "EXIT", timestamp: Date.now() });
    expect(shouldTune(state, 0)).toBe(false);
  });

  it("returns false when interval not met", () => {
    const state = createPerformanceState();
    state.results = Array(15).fill({ concept: "X", category: "other", profitMultiple: 1, performanceScore: 0.5, exitAction: "EXIT", timestamp: Date.now() });
    // Last tune was just now
    expect(shouldTune(state, Date.now())).toBe(false);
  });

  it("returns true when both conditions met", () => {
    const state = createPerformanceState();
    state.results = Array(15).fill({ concept: "X", category: "other", profitMultiple: 1, performanceScore: 0.5, exitAction: "EXIT", timestamp: Date.now() });
    // Last tune was long ago
    expect(shouldTune(state, 0)).toBe(true);
  });

  it("respects custom config", () => {
    const state = createPerformanceState();
    state.results = Array(3).fill({ concept: "X", category: "other", profitMultiple: 1, performanceScore: 0.5, exitAction: "EXIT", timestamp: Date.now() });

    // Custom: only need 2 samples
    expect(shouldTune(state, 0, { minSampleSize: 2, tuneIntervalMs: 0 })).toBe(true);
  });
});

describe("calculateWeightAdjustments", () => {
  const baseWeights: ScoringWeights = {
    volume: 0.3,
    recency: 0.25,
    social: 0.25,
    novelty: 0.2,
  };

  it("returns tuned=false when no correlation data", () => {
    const correlations = new Map([
      ["volume", 0], ["recency", 0], ["social", 0], ["novelty", 0],
    ]);

    const result = calculateWeightAdjustments(baseWeights, correlations);
    expect(result.tuned).toBe(false);
    expect(result.newWeights).toEqual(baseWeights);
  });

  it("increases weight for factors with higher correlation", () => {
    const correlations = new Map([
      ["volume", 0.8], // High correlation
      ["recency", 0.2],
      ["social", 0.2],
      ["novelty", 0.2],
    ]);

    const result = calculateWeightAdjustments(baseWeights, correlations);
    expect(result.tuned).toBe(true);
    // Volume should get more weight since it has highest correlation
    expect(result.newWeights.volume).toBeGreaterThan(baseWeights.volume);
  });

  it("keeps weights within bounds", () => {
    const correlations = new Map([
      ["volume", 10], // Very high
      ["recency", 0],
      ["social", 0],
      ["novelty", 0],
    ]);

    const result = calculateWeightAdjustments(baseWeights, correlations);
    expect(result.newWeights.volume).toBeLessThanOrEqual(0.5);
    expect(result.newWeights.recency).toBeGreaterThanOrEqual(0.1);
    expect(result.newWeights.social).toBeGreaterThanOrEqual(0.1);
    expect(result.newWeights.novelty).toBeGreaterThanOrEqual(0.1);
  });

  it("weights sum to 1.0", () => {
    const correlations = new Map([
      ["volume", 0.5], ["recency", 0.3], ["social", 0.7], ["novelty", 0.1],
    ]);

    const result = calculateWeightAdjustments(baseWeights, correlations);
    const total =
      result.newWeights.volume +
      result.newWeights.recency +
      result.newWeights.social +
      result.newWeights.novelty;

    expect(total).toBeCloseTo(1.0, 10);
  });

  it("preserves previous weights in result", () => {
    const correlations = new Map([
      ["volume", 0.5], ["recency", 0.5], ["social", 0.5], ["novelty", 0.5],
    ]);

    const result = calculateWeightAdjustments(baseWeights, correlations);
    expect(result.previousWeights).toEqual(baseWeights);
  });

  it("respects custom adjustment rate", () => {
    const correlations = new Map([
      ["volume", 0.8], ["recency", 0.2], ["social", 0.2], ["novelty", 0.2],
    ]);

    const slow = calculateWeightAdjustments(baseWeights, correlations, { adjustmentRate: 0.01 });
    const fast = calculateWeightAdjustments(baseWeights, correlations, { adjustmentRate: 0.1 });

    // Fast adjustment should move weights more
    const slowDelta = Math.abs(slow.newWeights.volume - baseWeights.volume);
    const fastDelta = Math.abs(fast.newWeights.volume - baseWeights.volume);
    expect(fastDelta).toBeGreaterThanOrEqual(slowDelta);
  });
});

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 1.0", () => {
    const weights = { volume: 0.5, recency: 0.5, social: 0.5, novelty: 0.5 };
    const normalized = normalizeWeights(weights);
    const total = normalized.volume + normalized.recency + normalized.social + normalized.novelty;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it("returns equal weights for all zeros", () => {
    const weights = { volume: 0, recency: 0, social: 0, novelty: 0 };
    const normalized = normalizeWeights(weights);
    expect(normalized.volume).toBe(0.25);
    expect(normalized.recency).toBe(0.25);
  });
});
