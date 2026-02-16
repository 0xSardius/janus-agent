import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import { SAFETY_LIMITS } from "../constants.js";
import type { AgentState, MarketConditions, LaunchedToken } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockAgentState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    ethBalance: parseEther("0.5"),
    usdcBalance: BigInt(50) * BigInt(1e6), // 50 USDC
    launchedTokens: [],
    scoredConcepts: [
      { concept: "test", score: 0.75, factors: undefined },
    ],
    lastLaunchTimestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
    consecutiveFailures: 0,
    dailyGasSpent: BigInt(0),
    todayLaunchCount: 0,
    ...overrides,
  };
}

function createMockMarketConditions(
  overrides: Partial<MarketConditions> = {}
): MarketConditions {
  return {
    hourlyVolume: parseEther("15"), // 15 ETH
    recentLaunches: 5,
    gasPrice: BigInt(30) * BigInt(1e9), // 30 gwei
    timestamp: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION FACTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Decision Factors", () => {
  describe("Budget Constraints", () => {
    it("should pass gas check when balance > minEthBalance", () => {
      const state = createMockAgentState({
        ethBalance: parseEther("0.5"),
      });

      const hasEnoughGas = state.ethBalance > SAFETY_LIMITS.minEthBalance;

      expect(hasEnoughGas).toBe(true);
    });

    it("should fail gas check when balance < minEthBalance", () => {
      const state = createMockAgentState({
        ethBalance: parseEther("0.003"),
      });

      const hasEnoughGas = state.ethBalance > SAFETY_LIMITS.minEthBalance;

      expect(hasEnoughGas).toBe(false);
    });

    it("should require minimum 10 USDC", () => {
      const state = createMockAgentState({
        usdcBalance: BigInt(5) * BigInt(1e6), // 5 USDC
      });

      const hasEnoughUSDC = state.usdcBalance > BigInt(10) * BigInt(1e6);

      expect(hasEnoughUSDC).toBe(false);
    });
  });

  describe("Cooldown Check", () => {
    it("should pass when 2+ hours since last launch", () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      const state = createMockAgentState({
        lastLaunchTimestamp: threeHoursAgo,
      });

      const timeSinceLaunch = Date.now() - state.lastLaunchTimestamp;
      const cooldownMet = timeSinceLaunch > SAFETY_LIMITS.minTimeBetweenLaunches;

      expect(cooldownMet).toBe(true);
    });

    it("should fail when less than 2 hours since last launch", () => {
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
      const state = createMockAgentState({
        lastLaunchTimestamp: oneHourAgo,
      });

      const timeSinceLaunch = Date.now() - state.lastLaunchTimestamp;
      const cooldownMet = timeSinceLaunch > SAFETY_LIMITS.minTimeBetweenLaunches;

      expect(cooldownMet).toBe(false);
    });
  });

  describe("Market Activity", () => {
    it("should detect high activity market", () => {
      const market = createMockMarketConditions({
        hourlyVolume: parseEther("20"), // 20 ETH > 10 ETH threshold
      });

      const threshold = parseEther("10");
      const isHighActivity = market.hourlyVolume > threshold;

      expect(isHighActivity).toBe(true);
    });

    it("should detect low activity market", () => {
      const market = createMockMarketConditions({
        hourlyVolume: parseEther("5"), // 5 ETH < 10 ETH threshold
      });

      const threshold = parseEther("10");
      const isHighActivity = market.hourlyVolume > threshold;

      expect(isHighActivity).toBe(false);
    });

    it("should detect saturated market", () => {
      const market = createMockMarketConditions({
        recentLaunches: 25, // > 20 threshold
      });

      const saturationThreshold = 20;
      const isNotOversaturated = market.recentLaunches < saturationThreshold;

      expect(isNotOversaturated).toBe(false);
    });
  });

  describe("Concept Quality", () => {
    it("should pass when top concept score >= 0.65", () => {
      const state = createMockAgentState({
        scoredConcepts: [{ concept: "good", score: 0.75, factors: undefined }],
      });

      const topScore = state.scoredConcepts[0]?.score || 0;

      expect(topScore).toBeGreaterThanOrEqual(SAFETY_LIMITS.minConceptScore);
    });

    it("should fail when top concept score < 0.65", () => {
      const state = createMockAgentState({
        scoredConcepts: [{ concept: "weak", score: 0.5, factors: undefined }],
      });

      const topScore = state.scoredConcepts[0]?.score || 0;

      expect(topScore).toBeLessThan(SAFETY_LIMITS.minConceptScore);
    });

    it("should handle empty concepts", () => {
      const state = createMockAgentState({
        scoredConcepts: [],
      });

      const topScore = state.scoredConcepts[0]?.score || 0;

      expect(topScore).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DECISION MATRIX TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Decision Matrix Scoring", () => {
  it("should calculate weighted score correctly", () => {
    // Simulate the decision matrix calculation
    const factors = {
      hasEnoughGas: true, // 0.15
      hasEnoughUSDC: true, // 0.10
      recentSuccessRate: 0.8, // * 0.20 = 0.16
      isHighActivity: true, // 0.15
      isNotOversaturated: true, // 0.10
      topConceptScore: 0.75, // * 0.20 = 0.15
      minCooldownMet: true, // 0.10
    };

    const score =
      (factors.hasEnoughGas ? 0.15 : 0) +
      (factors.hasEnoughUSDC ? 0.1 : 0) +
      factors.recentSuccessRate * 0.2 +
      (factors.isHighActivity ? 0.15 : 0) +
      (factors.isNotOversaturated ? 0.1 : 0) +
      factors.topConceptScore * 0.2 +
      (factors.minCooldownMet ? 0.1 : 0);

    // 0.15 + 0.10 + 0.16 + 0.15 + 0.10 + 0.15 + 0.10 = 0.91
    expect(score).toBeCloseTo(0.91, 2);
  });

  it("should fail when gas requirement not met", () => {
    const factors = {
      hasEnoughGas: false,
      hasEnoughUSDC: true,
      recentSuccessRate: 1.0,
      isHighActivity: true,
      isNotOversaturated: true,
      topConceptScore: 0.9,
      minCooldownMet: true,
    };

    const score =
      (factors.hasEnoughGas ? 0.15 : 0) +
      (factors.hasEnoughUSDC ? 0.1 : 0) +
      factors.recentSuccessRate * 0.2 +
      (factors.isHighActivity ? 0.15 : 0) +
      (factors.isNotOversaturated ? 0.1 : 0) +
      factors.topConceptScore * 0.2 +
      (factors.minCooldownMet ? 0.1 : 0);

    // Even with high score, should not launch without gas
    const shouldLaunch =
      score > SAFETY_LIMITS.minConceptScore && factors.hasEnoughGas;

    expect(shouldLaunch).toBe(false);
  });

  it("should fail when cooldown not met", () => {
    const factors = {
      hasEnoughGas: true,
      hasEnoughUSDC: true,
      recentSuccessRate: 1.0,
      isHighActivity: true,
      isNotOversaturated: true,
      topConceptScore: 0.9,
      minCooldownMet: false,
    };

    const shouldLaunch =
      factors.hasEnoughGas && factors.minCooldownMet;

    expect(shouldLaunch).toBe(false);
  });

  it("should pass all conditions for ideal scenario", () => {
    const factors = {
      hasEnoughGas: true,
      hasEnoughUSDC: true,
      recentSuccessRate: 0.8,
      isHighActivity: true,
      isNotOversaturated: true,
      topConceptScore: 0.8,
      minCooldownMet: true,
    };

    const score =
      (factors.hasEnoughGas ? 0.15 : 0) +
      (factors.hasEnoughUSDC ? 0.1 : 0) +
      factors.recentSuccessRate * 0.2 +
      (factors.isHighActivity ? 0.15 : 0) +
      (factors.isNotOversaturated ? 0.1 : 0) +
      factors.topConceptScore * 0.2 +
      (factors.minCooldownMet ? 0.1 : 0);

    const shouldLaunch =
      score > SAFETY_LIMITS.minConceptScore &&
      factors.hasEnoughGas &&
      factors.minCooldownMet;

    expect(shouldLaunch).toBe(true);
    expect(score).toBeGreaterThan(0.65);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIMING OPTIMIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Timing Optimization", () => {
  it("should suggest immediate launch in very active market", () => {
    const market = createMockMarketConditions({
      hourlyVolume: parseEther("25"), // 2.5x threshold
    });

    const threshold = parseEther("10");
    const isVeryActive = market.hourlyVolume > threshold * BigInt(2);

    expect(isVeryActive).toBe(true);
  });

  it("should detect peak hours (UTC 00:00-04:00)", () => {
    // Test at different hours
    const isPeakHour = (hour: number) => hour >= 0 && hour <= 4;

    expect(isPeakHour(2)).toBe(true);
    expect(isPeakHour(12)).toBe(false);
    expect(isPeakHour(0)).toBe(true);
    expect(isPeakHour(4)).toBe(true);
    expect(isPeakHour(5)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS RATE CALCULATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Success Rate Calculation", () => {
  it("should return 0.5 for no launch history", () => {
    const launchedTokens: LaunchedToken[] = [];
    const successRate = launchedTokens.length === 0 ? 0.5 : 1.0;

    expect(successRate).toBe(0.5);
  });

  it("should calculate success rate from recent launches", () => {
    const launchedTokens: LaunchedToken[] = [
      { address: "0x1", tokenId: BigInt(1), name: "T1", symbol: "T1", launchedAt: Date.now(), txHash: "0x" },
      { address: "0x2", tokenId: BigInt(2), name: "T2", symbol: "T2", launchedAt: Date.now(), txHash: "0x" },
    ];

    // All completed launches count as successful in current implementation
    const recent = launchedTokens.slice(-10);
    const successRate = recent.length / Math.max(recent.length, 1);

    expect(successRate).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY LIMITS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Safety Limits Validation", () => {
  it("should have correct minEthBalance", () => {
    expect(SAFETY_LIMITS.minEthBalance).toBe(parseEther("0.005"));
  });

  it("should have correct maxLaunchesPerDay", () => {
    expect(SAFETY_LIMITS.maxLaunchesPerDay).toBe(3);
  });

  it("should have correct minTimeBetweenLaunches (2 hours)", () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    expect(SAFETY_LIMITS.minTimeBetweenLaunches).toBe(twoHoursMs);
  });

  it("should have correct minConceptScore", () => {
    expect(SAFETY_LIMITS.minConceptScore).toBe(0.65);
  });

  it("should have correct minConfidenceThreshold", () => {
    expect(SAFETY_LIMITS.minConfidenceThreshold).toBe(0.7);
  });

  it("should have correct pauseOnHighGas (100 gwei)", () => {
    expect(SAFETY_LIMITS.pauseOnHighGas).toBe(100);
  });
});
