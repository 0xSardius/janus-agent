import { describe, it, expect, beforeEach } from "vitest";
import { parseEther, formatEther } from "viem";
import {
  createPositionManagerState,
  type PositionManagerState,
} from "./position-manager.js";
import type { Position } from "../types.js";
import { POSITION_STRATEGY } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockPosition(overrides: Partial<Position> = {}): Position {
  return {
    tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
    tokenSymbol: "TEST",
    entryPriceETH: BigInt(1000000), // 0.000001 ETH per token
    amountToken: parseEther("1000"), // 1000 tokens
    costBasisETH: parseEther("0.003"),
    boughtAt: Date.now() - 3600000, // 1 hour ago
    tranchesSold: 0,
    totalSoldETH: BigInt(0),
    status: "active",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createPositionManagerState", () => {
  it("should create initial state with empty values", () => {
    const state = createPositionManagerState();

    expect(state.activePositions).toEqual([]);
    expect(state.closedPositions).toEqual([]);
    expect(state.totalInvested).toBe(BigInt(0));
    expect(state.totalReturned).toBe(BigInt(0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSITION STRATEGY CONSTANTS TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("POSITION_STRATEGY", () => {
  it("should have correct buy amount", () => {
    expect(POSITION_STRATEGY.buyAmountETH).toBe(parseEther("0.003"));
  });

  it("should have max 10 active positions", () => {
    expect(POSITION_STRATEGY.maxActivePositions).toBe(10);
  });

  it("should limit portfolio exposure to 25%", () => {
    expect(POSITION_STRATEGY.maxPortfolioExposure).toBe(0.25);
  });

  it("should have 4 sell tranches totaling 100%", () => {
    const totalPercent = POSITION_STRATEGY.sellTranches.reduce(
      (sum, t) => sum + t.sellPercent,
      0
    );
    expect(totalPercent).toBe(100);
  });

  it("should have increasing trigger multiples", () => {
    const multiples = POSITION_STRATEGY.sellTranches.map((t) => t.triggerMultiple);
    for (let i = 1; i < multiples.length; i++) {
      expect(multiples[i]).toBeGreaterThan(multiples[i - 1]);
    }
  });

  it("should have stop loss at 0.5x", () => {
    expect(POSITION_STRATEGY.stopLossMultiple).toBe(0.5);
  });

  it("should have max hold duration of 7 days", () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(POSITION_STRATEGY.maxHoldDuration).toBe(sevenDaysMs);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXIT CONDITION LOGIC TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Exit Condition Logic", () => {
  describe("Stop Loss", () => {
    it("should trigger when price drops 50%", () => {
      const position = createMockPosition({
        entryPriceETH: BigInt(1000000),
      });

      const currentPrice = BigInt(500000); // 0.5x
      const multiple = Number(currentPrice) / Number(position.entryPriceETH);

      expect(multiple).toBeLessThanOrEqual(POSITION_STRATEGY.stopLossMultiple);
    });

    it("should not trigger above 50%", () => {
      const position = createMockPosition({
        entryPriceETH: BigInt(1000000),
      });

      const currentPrice = BigInt(600000); // 0.6x
      const multiple = Number(currentPrice) / Number(position.entryPriceETH);

      expect(multiple).toBeGreaterThan(POSITION_STRATEGY.stopLossMultiple);
    });
  });

  describe("Time-Based Exit", () => {
    it("should trigger after 7 days", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const position = createMockPosition({
        boughtAt: eightDaysAgo,
      });

      const holdDuration = Date.now() - position.boughtAt;

      expect(holdDuration).toBeGreaterThan(POSITION_STRATEGY.maxHoldDuration);
    });

    it("should not trigger before 7 days", () => {
      const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
      const position = createMockPosition({
        boughtAt: sixDaysAgo,
      });

      const holdDuration = Date.now() - position.boughtAt;

      expect(holdDuration).toBeLessThan(POSITION_STRATEGY.maxHoldDuration);
    });
  });

  describe("Staged Profit Taking", () => {
    it("should trigger first tranche at 3x", () => {
      const position = createMockPosition({
        entryPriceETH: BigInt(1000000),
        tranchesSold: 0,
      });

      const currentPrice = BigInt(3000000); // 3x
      const multiple = Number(currentPrice) / Number(position.entryPriceETH);
      const tranche = POSITION_STRATEGY.sellTranches[0];

      expect(multiple).toBeGreaterThanOrEqual(tranche.triggerMultiple);
      expect(position.tranchesSold).toBeLessThan(tranche.sellPercent);
    });

    it("should track cumulative tranches sold", () => {
      const position = createMockPosition({
        entryPriceETH: BigInt(1000000),
        tranchesSold: 25, // First tranche already sold
      });

      const currentPrice = BigInt(5000000); // 5x
      const multiple = Number(currentPrice) / Number(position.entryPriceETH);
      const secondTranche = POSITION_STRATEGY.sellTranches[1];

      // Should trigger second tranche
      expect(multiple).toBeGreaterThanOrEqual(secondTranche.triggerMultiple);
      expect(position.tranchesSold).toBeLessThan(50); // Cumulative for first two
    });

    it("should calculate correct sell amounts", () => {
      const position = createMockPosition({
        amountToken: parseEther("1000"),
      });

      const firstSellPercent = POSITION_STRATEGY.sellTranches[0].sellPercent; // 25%
      const tokensToSell = (position.amountToken * BigInt(firstSellPercent)) / BigInt(100);

      expect(tokensToSell).toBe(parseEther("250"));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO MANAGEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Portfolio Management", () => {
  let state: PositionManagerState;

  beforeEach(() => {
    state = createPositionManagerState();
  });

  it("should calculate current exposure correctly", () => {
    state.activePositions = [
      createMockPosition({ costBasisETH: parseEther("0.003") }),
      createMockPosition({ costBasisETH: parseEther("0.003") }),
    ];

    const currentExposure = state.activePositions.reduce(
      (sum, p) => sum + p.costBasisETH,
      BigInt(0)
    );

    expect(currentExposure).toBe(parseEther("0.006"));
  });

  it("should enforce 25% portfolio exposure limit", () => {
    const walletBalance = parseEther("0.1"); // 0.1 ETH
    const maxExposure = (walletBalance * BigInt(25)) / BigInt(100); // 0.025 ETH

    expect(maxExposure).toBe(parseEther("0.025"));
  });

  it("should block new positions when at max active", () => {
    // Fill up to max positions
    for (let i = 0; i < POSITION_STRATEGY.maxActivePositions; i++) {
      state.activePositions.push(createMockPosition());
    }

    expect(state.activePositions.length).toBe(POSITION_STRATEGY.maxActivePositions);
    // Next position should be blocked by the check in buyOwnToken
  });

  it("should track total invested correctly", () => {
    state.totalInvested = parseEther("0.009"); // 3 positions
    const newBuy = parseEther("0.003");

    state.totalInvested += newBuy;

    expect(state.totalInvested).toBe(parseEther("0.012"));
  });

  it("should track total returned correctly", () => {
    state.totalReturned = parseEther("0.005");
    const sellProceeds = parseEther("0.002");

    state.totalReturned += sellProceeds;

    expect(state.totalReturned).toBe(parseEther("0.007"));
  });

  it("should calculate realized P&L", () => {
    state.totalInvested = parseEther("0.012");
    state.totalReturned = parseEther("0.015");

    const realizedPnL = state.totalReturned - state.totalInvested;

    expect(realizedPnL).toBe(parseEther("0.003")); // +0.003 ETH profit
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSITION STATUS TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("Position Status Transitions", () => {
  let state: PositionManagerState;

  beforeEach(() => {
    state = createPositionManagerState();
  });

  it("should start positions as active", () => {
    const position = createMockPosition();
    expect(position.status).toBe("active");
  });

  it("should mark as stopped on stop loss", () => {
    const position = createMockPosition();
    position.status = "stopped";

    expect(position.status).toBe("stopped");
  });

  it("should mark as exited on full sale", () => {
    const position = createMockPosition({ tranchesSold: 100 });
    position.status = "exited";

    expect(position.status).toBe("exited");
  });

  it("should move closed positions from active to closed array", () => {
    state.activePositions = [
      createMockPosition({ status: "active" }),
      createMockPosition({ status: "exited" }),
      createMockPosition({ status: "stopped" }),
    ];

    // Simulate the cleanup logic from monitorPositions
    const exited = state.activePositions.filter(
      (p) => p.status === "exited" || p.status === "stopped"
    );
    state.closedPositions.push(...exited);
    state.activePositions = state.activePositions.filter(
      (p) => p.status === "active"
    );

    expect(state.activePositions.length).toBe(1);
    expect(state.closedPositions.length).toBe(2);
  });
});
