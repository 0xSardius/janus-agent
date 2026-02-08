import { describe, it, expect } from "vitest";
import type { ServerResponse } from "http";
import {
  handleTrends,
  handleScoreConcept,
  handlePortfolio,
  handlePerformance,
  type ApiContext,
} from "./routes.js";
import { createAnalyzerState } from "../contexts/analyzer.js";
import { createPositionManagerState } from "../contexts/position-manager.js";
import { createPerformanceState } from "../performance/tracker.js";

function mockRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    _status: 0,
    _body: "",
    writeHead(status: number, _headers?: Record<string, string>) {
      res._status = status;
    },
    end(body?: string) {
      res._body = body || "";
    },
  };
  return res as unknown as ServerResponse & { _status: number; _body: string };
}

function createTestContext(overrides: Partial<ApiContext> = {}): ApiContext {
  const analyzerState = createAnalyzerState();
  const positionState = createPositionManagerState();

  return {
    getAnalyzerState: () => analyzerState,
    getPositionManagerState: () => positionState,
    ...overrides,
  };
}

describe("handleTrends", () => {
  it("returns empty concepts list when no scored concepts", () => {
    const res = mockRes();
    handleTrends(res, createTestContext());
    const body = JSON.parse(res._body);
    expect(body.concepts).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("returns scored concepts with factors", () => {
    const ctx = createTestContext();
    const state = ctx.getAnalyzerState();
    state.scoredConcepts = [
      { concept: "PEPE", score: 0.8, factors: { volumeScore: 0.9, recencyScore: 0.7, socialScore: 0.6, noveltyScore: 0.8 } },
      { concept: "DOGE", score: 0.6, factors: { volumeScore: 0.5, recencyScore: 0.5, socialScore: 0.5, noveltyScore: 0.8 } },
    ];

    const res = mockRes();
    handleTrends(res, ctx);
    const body = JSON.parse(res._body);
    expect(body.concepts).toHaveLength(2);
    expect(body.concepts[0].concept).toBe("PEPE");
    expect(body.concepts[0].score).toBe(0.8);
  });
});

describe("handleScoreConcept", () => {
  it("returns cached score when available", async () => {
    const ctx = createTestContext();
    ctx.getAnalyzerState().scoredConcepts = [
      { concept: "PEPE", score: 0.85, factors: { volumeScore: 0.9, recencyScore: 0.8, socialScore: 0.7, noveltyScore: 0.8 } },
    ];

    const res = mockRes();
    await handleScoreConcept(res, "PEPE", ctx);
    const body = JSON.parse(res._body);
    expect(body.source).toBe("cached");
    expect(body.score).toBe(0.85);
  });

  it("returns on-demand response for unknown concept", async () => {
    const res = mockRes();
    await handleScoreConcept(res, "UNKNOWN", createTestContext());
    const body = JSON.parse(res._body);
    expect(body.source).toBe("on-demand");
  });

  it("includes social score when provider available", async () => {
    const mockProvider = {
      getScore: async () => 0.7,
      getDetails: async () => ({ score: 0.7 }),
      clearCache: () => {},
    };

    const ctx = createTestContext({
      getSocialProvider: () => mockProvider,
    });

    const res = mockRes();
    await handleScoreConcept(res, "NEWCOIN", ctx);
    const body = JSON.parse(res._body);
    expect(body.socialScore).toBe(0.7);
  });
});

describe("handlePortfolio", () => {
  it("returns empty portfolio", () => {
    const res = mockRes();
    handlePortfolio(res, createTestContext());
    const body = JSON.parse(res._body);
    expect(body.activeCount).toBe(0);
    expect(body.closedCount).toBe(0);
  });

  it("returns active positions with details", () => {
    const ctx = createTestContext();
    ctx.getPositionManagerState().activePositions.push({
      tokenAddress: "0x123",
      tokenSymbol: "TEST",
      entryPriceETH: BigInt(1000),
      amountToken: BigInt(1000000),
      costBasisETH: BigInt(3000000000000000),
      boughtAt: Date.now(),
      tranchesSold: 0,
      totalSoldETH: BigInt(0),
      status: "active",
      concept: "test concept",
    });

    const res = mockRes();
    handlePortfolio(res, ctx);
    const body = JSON.parse(res._body);
    expect(body.activeCount).toBe(1);
    expect(body.activePositions[0].token).toBe("TEST");
    expect(body.activePositions[0].concept).toBe("test concept");
  });
});

describe("handlePerformance", () => {
  it("returns 404 when no performance state", () => {
    const res = mockRes();
    handlePerformance(res, createTestContext());
    expect(res._status).toBe(404);
  });

  it("returns performance data when available", () => {
    const perfState = createPerformanceState();
    perfState.results.push({
      concept: "PEPE",
      category: "animal",
      profitMultiple: 3.0,
      performanceScore: 0.8,
      exitAction: "TAKE_PROFIT_3x",
      timestamp: Date.now(),
    });
    perfState.categoryPerformance.set("animal", {
      totalResults: 1,
      avgScore: 0.8,
      emaScore: 0.8,
    });

    const ctx = createTestContext({
      getPerformanceState: () => perfState,
    });

    const res = mockRes();
    handlePerformance(res, ctx);
    const body = JSON.parse(res._body);
    expect(body.totalResults).toBe(1);
    expect(body.successRate).toBe(1);
    expect(body.categories.animal.totalResults).toBe(1);
    expect(body.recentResults).toHaveLength(1);
  });

  it("calculates correct success rate", () => {
    const perfState = createPerformanceState();
    perfState.results = [
      { concept: "A", category: "other", profitMultiple: 3, performanceScore: 0.8, exitAction: "PROFIT", timestamp: Date.now() },
      { concept: "B", category: "other", profitMultiple: 0.5, performanceScore: 0, exitAction: "STOP", timestamp: Date.now() },
    ];

    const ctx = createTestContext({ getPerformanceState: () => perfState });
    const res = mockRes();
    handlePerformance(res, ctx);
    const body = JSON.parse(res._body);
    expect(body.successRate).toBe(0.5);
  });
});
