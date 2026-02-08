import { describe, it, expect } from "vitest";
import {
  createPerformanceState,
  calculatePerformanceScore,
  categorizeConcept,
  recordPositionPerformance,
  getRecentSuccessRate,
} from "./tracker.js";
import { createAnalyzerState } from "../contexts/analyzer.js";
import type { Position, PositionExitResult } from "../types.js";

describe("calculatePerformanceScore", () => {
  it("returns 0 for stop loss (0.5x)", () => {
    expect(calculatePerformanceScore(0.5)).toBe(0);
  });

  it("returns 0 for below stop loss", () => {
    expect(calculatePerformanceScore(0.2)).toBe(0);
  });

  it("returns 0.5 for break-even (1.0x)", () => {
    expect(calculatePerformanceScore(1.0)).toBe(0.5);
  });

  it("returns 1.0 for 20x", () => {
    expect(calculatePerformanceScore(20)).toBe(1.0);
  });

  it("returns 1.0 for above 20x", () => {
    expect(calculatePerformanceScore(50)).toBe(1.0);
  });

  it("returns value between 0 and 0.5 for sub-breakeven", () => {
    const score = calculatePerformanceScore(0.75);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });

  it("returns value between 0.5 and 1.0 for profitable", () => {
    const score = calculatePerformanceScore(5);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it("scales correctly between profit levels", () => {
    const score3x = calculatePerformanceScore(3);
    const score10x = calculatePerformanceScore(10);
    expect(score10x).toBeGreaterThan(score3x);
  });
});

describe("categorizeConcept", () => {
  it("categorizes animal concepts", () => {
    expect(categorizeConcept("DOGECOIN")).toBe("animal");
    expect(categorizeConcept("pepe frog")).toBe("animal");
    expect(categorizeConcept("shib army")).toBe("animal");
  });

  it("categorizes AI concepts", () => {
    expect(categorizeConcept("AI agent")).toBe("ai");
    expect(categorizeConcept("GPT token")).toBe("ai");
  });

  it("categorizes food concepts", () => {
    expect(categorizeConcept("pizza coin")).toBe("food");
  });

  it("categorizes culture concepts", () => {
    expect(categorizeConcept("based chad")).toBe("culture");
    expect(categorizeConcept("wojak meme")).toBe("culture");
  });

  it("returns 'other' for unknown concepts", () => {
    expect(categorizeConcept("quantum xyz")).toBe("other");
  });
});

describe("recordPositionPerformance", () => {
  function makePosition(concept: string): Position {
    return {
      tokenAddress: "0x123",
      tokenSymbol: "TEST",
      entryPriceETH: BigInt(1000),
      amountToken: BigInt(1000000),
      costBasisETH: BigInt(3000000000000000),
      boughtAt: Date.now() - 86400000,
      tranchesSold: 100,
      totalSoldETH: BigInt(9000000000000000),
      status: "exited",
      concept,
    };
  }

  function makeExit(multiple: string): PositionExitResult {
    return {
      token: "TEST",
      action: "TAKE_PROFIT_3x",
      multiple,
      ethReceived: "0.009",
    };
  }

  it("records result and updates category", () => {
    const perfState = createPerformanceState();
    const analyzerState = createAnalyzerState();
    const position = makePosition("DOGECOIN");
    const exit = makeExit("3.00");

    recordPositionPerformance(perfState, analyzerState, "DOGECOIN", position, exit);

    expect(perfState.results).toHaveLength(1);
    expect(perfState.results[0].concept).toBe("DOGECOIN");
    expect(perfState.results[0].category).toBe("animal");
    expect(perfState.categoryPerformance.has("animal")).toBe(true);
  });

  it("updates analyzer historical performance", () => {
    const perfState = createPerformanceState();
    const analyzerState = createAnalyzerState();

    recordPositionPerformance(
      perfState, analyzerState, "PEPE",
      makePosition("PEPE"), makeExit("5.00")
    );

    expect(analyzerState.historicalPerformance.has("pepe")).toBe(true);
  });

  it("tracks factor correlations when provided", () => {
    const perfState = createPerformanceState();
    const analyzerState = createAnalyzerState();
    const factors = { volumeScore: 0.8, recencyScore: 0.9, socialScore: 0.7, noveltyScore: 0.6 };

    recordPositionPerformance(
      perfState, analyzerState, "TEST",
      makePosition("TEST"), makeExit("3.00"), factors
    );

    expect(perfState.factorCorrelations.get("volume")).not.toBe(0);
    expect(perfState.factorCorrelations.get("recency")).not.toBe(0);
  });

  it("updates category EMA over multiple results", () => {
    const perfState = createPerformanceState();
    const analyzerState = createAnalyzerState();

    recordPositionPerformance(
      perfState, analyzerState, "DOGE",
      makePosition("DOGE"), makeExit("5.00")
    );
    recordPositionPerformance(
      perfState, analyzerState, "SHIB",
      makePosition("SHIB"), makeExit("0.50")
    );

    const catPerf = perfState.categoryPerformance.get("animal")!;
    expect(catPerf.totalResults).toBe(2);
    // EMA should be between the two scores
    expect(catPerf.emaScore).toBeGreaterThan(0);
  });
});

describe("getRecentSuccessRate", () => {
  it("returns 0.5 for empty history", () => {
    const state = createPerformanceState();
    expect(getRecentSuccessRate(state)).toBe(0.5);
  });

  it("returns 1.0 when all profitable", () => {
    const state = createPerformanceState();
    state.results = [
      { concept: "A", category: "other", profitMultiple: 3, performanceScore: 0.8, exitAction: "TAKE_PROFIT", timestamp: Date.now() },
      { concept: "B", category: "other", profitMultiple: 2, performanceScore: 0.7, exitAction: "TAKE_PROFIT", timestamp: Date.now() },
    ];
    expect(getRecentSuccessRate(state)).toBe(1.0);
  });

  it("returns 0.0 when all stopped out", () => {
    const state = createPerformanceState();
    state.results = [
      { concept: "A", category: "other", profitMultiple: 0.5, performanceScore: 0, exitAction: "STOP_LOSS", timestamp: Date.now() },
      { concept: "B", category: "other", profitMultiple: 0.3, performanceScore: 0, exitAction: "STOP_LOSS", timestamp: Date.now() },
    ];
    expect(getRecentSuccessRate(state)).toBe(0);
  });

  it("calculates correct rate for mixed results", () => {
    const state = createPerformanceState();
    state.results = [
      { concept: "A", category: "other", profitMultiple: 3, performanceScore: 0.8, exitAction: "TAKE_PROFIT", timestamp: Date.now() },
      { concept: "B", category: "other", profitMultiple: 0.5, performanceScore: 0, exitAction: "STOP_LOSS", timestamp: Date.now() },
      { concept: "C", category: "other", profitMultiple: 5, performanceScore: 0.9, exitAction: "TAKE_PROFIT", timestamp: Date.now() },
      { concept: "D", category: "other", profitMultiple: 0.4, performanceScore: 0, exitAction: "STOP_LOSS", timestamp: Date.now() },
    ];
    expect(getRecentSuccessRate(state)).toBe(0.5);
  });

  it("respects window size", () => {
    const state = createPerformanceState();
    // First 5 losses, then 5 wins
    for (let i = 0; i < 5; i++) {
      state.results.push({
        concept: `L${i}`, category: "other", profitMultiple: 0.3,
        performanceScore: 0, exitAction: "STOP_LOSS", timestamp: Date.now(),
      });
    }
    for (let i = 0; i < 5; i++) {
      state.results.push({
        concept: `W${i}`, category: "other", profitMultiple: 3,
        performanceScore: 0.8, exitAction: "TAKE_PROFIT", timestamp: Date.now(),
      });
    }

    // Window of 5 should only see wins
    expect(getRecentSuccessRate(state, 5)).toBe(1.0);
    // Window of 10 should see 50%
    expect(getRecentSuccessRate(state, 10)).toBe(0.5);
  });
});
