import { describe, it, expect, beforeEach } from "vitest";
import {
  createAnalyzerState,
  scoreConcept,
  scoreConcepts,
  selectLaunchCandidate,
  getNextCandidate,
  recordPerformance,
  type AnalyzerState,
} from "./analyzer.js";
import type { PoolData } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

function createMockPool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    id: "pool-1",
    memecoin: {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      symbol: "TEST",
      name: "Test Token",
    },
    volumeETH: "1.5",
    volumeUSD: "4500",
    createdAt: Math.floor(Date.now() / 1000) - 3600,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createAnalyzerState", () => {
  it("should create initial state with empty values", () => {
    const state = createAnalyzerState();

    expect(state.scoredConcepts).toEqual([]);
    expect(state.launchQueue).toEqual([]);
    expect(state.historicalPerformance.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT SCORING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("scoreConcept", () => {
  it("should return score between 0 and 1", async () => {
    const pools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "PEPE", name: "Pepe Token" },
        volumeETH: "10",
      }),
    ];

    const result = await scoreConcept("pepe", pools, new Set());

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.concept).toBe("pepe");
  });

  it("should include scoring factors", async () => {
    const pools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "TEST", name: "Test Token" },
        volumeETH: "5",
      }),
    ];

    const result = await scoreConcept("test", pools, new Set());

    expect(result.factors).toBeDefined();
    expect(result.factors?.volumeScore).toBeDefined();
    expect(result.factors?.recencyScore).toBeDefined();
    expect(result.factors?.socialScore).toBeDefined();
    expect(result.factors?.noveltyScore).toBeDefined();
  });

  it("should penalize previously used concepts", async () => {
    const pools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "USED", name: "Used Concept" },
        volumeETH: "10",
      }),
    ];

    const freshResult = await scoreConcept("used", pools, new Set());
    const usedResult = await scoreConcept("used", pools, new Set(["used"]));

    expect(freshResult.score).toBeGreaterThan(usedResult.score);
  });

  it("should score higher for high volume concepts", async () => {
    const highVolumePools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "HIGH", name: "High Token" },
        volumeETH: "100",
      }),
    ];

    const lowVolumePools = [
      createMockPool({
        memecoin: { address: "0x2", symbol: "LOW", name: "Low Token" },
        volumeETH: "0.1",
      }),
    ];

    const highResult = await scoreConcept("high", highVolumePools, new Set());
    const lowResult = await scoreConcept("low", lowVolumePools, new Set());

    expect(highResult.factors?.volumeScore).toBeGreaterThan(
      lowResult.factors?.volumeScore || 0
    );
  });

  it("should score higher for recent concepts", async () => {
    const recentPools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "NEW", name: "New Token" },
        volumeETH: "5",
        createdAt: Math.floor(Date.now() / 1000) - 1800, // 30 min ago
      }),
    ];

    const oldPools = [
      createMockPool({
        memecoin: { address: "0x2", symbol: "OLD", name: "Old Token" },
        volumeETH: "5",
        createdAt: Math.floor(Date.now() / 1000) - 172800, // 48 hours ago
      }),
    ];

    const recentResult = await scoreConcept("new", recentPools, new Set());
    const oldResult = await scoreConcept("old", oldPools, new Set());

    expect(recentResult.factors?.recencyScore).toBeGreaterThan(
      oldResult.factors?.recencyScore || 0
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SCORING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("scoreConcepts", () => {
  let state: AnalyzerState;

  beforeEach(() => {
    state = createAnalyzerState();
  });

  it("should score multiple concepts and sort by score", async () => {
    const pools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "HIGH", name: "High Volume" },
        volumeETH: "100",
      }),
      createMockPool({
        memecoin: { address: "0x2", symbol: "LOW", name: "Low Volume" },
        volumeETH: "0.1",
      }),
    ];

    const results = await scoreConcepts(state, ["high", "low"], pools);

    expect(results.length).toBe(2);
    // Should be sorted descending by score
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("should update state with scored concepts", async () => {
    const pools = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "TEST", name: "Test" },
        volumeETH: "10",
      }),
    ];

    await scoreConcepts(state, ["test", "other"], pools);

    expect(state.scoredConcepts.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH CANDIDATE SELECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("selectLaunchCandidate", () => {
  let state: AnalyzerState;

  beforeEach(() => {
    state = createAnalyzerState();
  });

  it("should return null when no concepts meet threshold", () => {
    state.scoredConcepts = [
      { concept: "low", score: 0.3, factors: undefined },
    ];

    const candidate = selectLaunchCandidate(state, 0.65);

    expect(candidate).toBeNull();
  });

  it("should select concept that meets threshold", () => {
    state.scoredConcepts = [
      { concept: "high", score: 0.8, factors: undefined },
      { concept: "low", score: 0.3, factors: undefined },
    ];

    const candidate = selectLaunchCandidate(state, 0.65);

    expect(candidate).not.toBeNull();
    expect(candidate?.concept).toBe("high");
    expect(candidate?.score).toBe(0.8);
  });

  it("should add selected candidate to launch queue", () => {
    state.scoredConcepts = [
      { concept: "queued", score: 0.9, factors: undefined },
    ];

    selectLaunchCandidate(state, 0.65);

    expect(state.launchQueue.length).toBe(1);
    expect(state.launchQueue[0].concept).toBe("queued");
  });

  it("should include timestamp when selected", () => {
    state.scoredConcepts = [
      { concept: "timed", score: 0.9, factors: undefined },
    ];

    const before = Date.now();
    const candidate = selectLaunchCandidate(state, 0.65);
    const after = Date.now();

    expect(candidate?.selectedAt).toBeGreaterThanOrEqual(before);
    expect(candidate?.selectedAt).toBeLessThanOrEqual(after);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("getNextCandidate", () => {
  let state: AnalyzerState;

  beforeEach(() => {
    state = createAnalyzerState();
  });

  it("should return null when queue is empty", () => {
    const candidate = getNextCandidate(state);
    expect(candidate).toBeNull();
  });

  it("should return and remove first candidate from queue", () => {
    state.launchQueue = [
      { concept: "first", selectedAt: 1000, score: 0.8 },
      { concept: "second", selectedAt: 2000, score: 0.7 },
    ];

    const candidate = getNextCandidate(state);

    expect(candidate?.concept).toBe("first");
    expect(state.launchQueue.length).toBe(1);
    expect(state.launchQueue[0].concept).toBe("second");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE TRACKING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("recordPerformance", () => {
  let state: AnalyzerState;

  beforeEach(() => {
    state = createAnalyzerState();
  });

  it("should record performance for new concept", () => {
    recordPerformance(state, "newconcept", 0.8);

    expect(state.historicalPerformance.has("newconcept")).toBe(true);
  });

  it("should use exponential moving average for updates", () => {
    recordPerformance(state, "concept", 1.0);
    const first = state.historicalPerformance.get("concept");

    recordPerformance(state, "concept", 0.0);
    const second = state.historicalPerformance.get("concept");

    // Should be between 0 and 1, closer to first due to EMA
    expect(second).toBeLessThan(first!);
    expect(second).toBeGreaterThan(0);
  });

  it("should normalize concept names to lowercase", () => {
    recordPerformance(state, "MixedCase", 0.5);

    expect(state.historicalPerformance.has("mixedcase")).toBe(true);
    expect(state.historicalPerformance.has("MixedCase")).toBe(false);
  });
});
