import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import {
  calculateTodayGasSpend,
  countLaunchesToday,
  canLaunchNow,
  isWithinPortfolioLimit,
} from "./safety.js";
import { SAFETY_LIMITS } from "./constants.js";
import type { LaunchedToken } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockLaunchedToken(
  launchedAt: number = Date.now()
): LaunchedToken {
  return {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    tokenId: BigInt(1),
    name: "Test Token",
    symbol: "TEST",
    launchedAt,
    txHash: "0xabcdef",
  };
}

function getTodayStart(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

// ═══════════════════════════════════════════════════════════════════════════
// GAS SPEND CALCULATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTodayGasSpend", () => {
  it("should return 0 for no launches", () => {
    const spend = calculateTodayGasSpend([]);
    expect(spend).toBe(BigInt(0));
  });

  it("should only count today's launches", () => {
    const todayStart = getTodayStart();
    const launchedTokens: LaunchedToken[] = [
      createMockLaunchedToken(todayStart + 1000), // Today
      createMockLaunchedToken(todayStart - 86400000), // Yesterday
    ];

    const spend = calculateTodayGasSpend(launchedTokens);

    // Only 1 launch today, estimated at 0.01 ETH
    expect(spend).toBe(BigInt(1e16));
  });

  it("should estimate gas based on launch count", () => {
    const todayStart = getTodayStart();
    const launchedTokens: LaunchedToken[] = [
      createMockLaunchedToken(todayStart + 1000),
      createMockLaunchedToken(todayStart + 2000),
      createMockLaunchedToken(todayStart + 3000),
    ];

    const spend = calculateTodayGasSpend(launchedTokens);

    // 3 launches * 0.01 ETH each
    expect(spend).toBe(BigInt(3e16));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH COUNT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("countLaunchesToday", () => {
  it("should return 0 for no launches", () => {
    const count = countLaunchesToday([]);
    expect(count).toBe(0);
  });

  it("should only count today's launches", () => {
    const todayStart = getTodayStart();
    const launchedTokens: LaunchedToken[] = [
      createMockLaunchedToken(todayStart + 1000), // Today
      createMockLaunchedToken(todayStart + 2000), // Today
      createMockLaunchedToken(todayStart - 86400000), // Yesterday
      createMockLaunchedToken(todayStart - 172800000), // 2 days ago
    ];

    const count = countLaunchesToday(launchedTokens);

    expect(count).toBe(2);
  });

  it("should include launches at exact midnight", () => {
    const todayStart = getTodayStart();
    const launchedTokens: LaunchedToken[] = [
      createMockLaunchedToken(todayStart), // Exactly at midnight
    ];

    const count = countLaunchesToday(launchedTokens);

    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COOLDOWN CHECK TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("canLaunchNow", () => {
  it("should return true when cooldown exceeded", () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const canLaunch = canLaunchNow(threeHoursAgo);

    expect(canLaunch).toBe(true);
  });

  it("should return false when within cooldown", () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
    const canLaunch = canLaunchNow(oneHourAgo);

    expect(canLaunch).toBe(false);
  });

  it("should return true at exactly 2 hours", () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000 - 1; // Just over 2 hours
    const canLaunch = canLaunchNow(twoHoursAgo);

    expect(canLaunch).toBe(true);
  });

  it("should return true for never launched (timestamp 0)", () => {
    const canLaunch = canLaunchNow(0);
    expect(canLaunch).toBe(true);
  });

  it("should use custom cooldown when specified", () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
    const thirtyMinCooldown = 30 * 60 * 1000;

    const canLaunch = canLaunchNow(oneHourAgo, thirtyMinCooldown);

    expect(canLaunch).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO LIMIT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("isWithinPortfolioLimit", () => {
  it("should return true when within limit", () => {
    const walletBalance = parseEther("1.0");
    const currentExposure = parseEther("0.1"); // 10%
    const newPosition = parseEther("0.1"); // +10% = 20% total

    const withinLimit = isWithinPortfolioLimit(
      currentExposure,
      newPosition,
      walletBalance
    );

    expect(withinLimit).toBe(true);
  });

  it("should return false when exceeding limit", () => {
    const walletBalance = parseEther("1.0");
    const currentExposure = parseEther("0.2"); // 20%
    const newPosition = parseEther("0.1"); // +10% = 30% total

    const withinLimit = isWithinPortfolioLimit(
      currentExposure,
      newPosition,
      walletBalance
    );

    expect(withinLimit).toBe(false);
  });

  it("should return true at exactly 25%", () => {
    const walletBalance = parseEther("1.0");
    const currentExposure = parseEther("0.22"); // 22%
    const newPosition = parseEther("0.03"); // +3% = 25% total

    const withinLimit = isWithinPortfolioLimit(
      currentExposure,
      newPosition,
      walletBalance
    );

    expect(withinLimit).toBe(true);
  });

  it("should handle zero current exposure", () => {
    const walletBalance = parseEther("1.0");
    const currentExposure = BigInt(0);
    const newPosition = parseEther("0.1");

    const withinLimit = isWithinPortfolioLimit(
      currentExposure,
      newPosition,
      walletBalance
    );

    expect(withinLimit).toBe(true);
  });

  it("should handle small wallet balances", () => {
    const walletBalance = parseEther("0.1"); // 0.1 ETH
    const currentExposure = parseEther("0.02"); // 20%
    const newPosition = parseEther("0.003"); // 3% more

    const withinLimit = isWithinPortfolioLimit(
      currentExposure,
      newPosition,
      walletBalance
    );

    expect(withinLimit).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY LIMITS CONSTANTS TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Safety Limits Constants", () => {
  it("should have maxDailyGasSpend of 0.01 ETH", () => {
    expect(SAFETY_LIMITS.maxDailyGasSpend).toBe(parseEther("0.01"));
  });

  it("should have maxSingleLaunchGas of 0.005 ETH", () => {
    expect(SAFETY_LIMITS.maxSingleLaunchGas).toBe(parseEther("0.005"));
  });

  it("should have minEthBalance of 0.005 ETH", () => {
    expect(SAFETY_LIMITS.minEthBalance).toBe(parseEther("0.005"));
  });

  it("should have maxConsecutiveFailures of 3", () => {
    expect(SAFETY_LIMITS.maxConsecutiveFailures).toBe(3);
  });

  it("should have emergencyStopFile path", () => {
    expect(SAFETY_LIMITS.emergencyStopFile).toBe("/tmp/agent-stop");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DAILY LIMIT SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

describe("Daily Limit Scenarios", () => {
  it("should allow up to 3 launches per day", () => {
    const todayStart = getTodayStart();
    const launches: LaunchedToken[] = [];

    for (let i = 0; i < 2; i++) {
      launches.push(createMockLaunchedToken(todayStart + i * 1000));
    }

    const count = countLaunchesToday(launches);
    const canLaunchMore = count < SAFETY_LIMITS.maxLaunchesPerDay;

    expect(canLaunchMore).toBe(true);
  });

  it("should block 4th launch in a day", () => {
    const todayStart = getTodayStart();
    const launches: LaunchedToken[] = [];

    for (let i = 0; i < 3; i++) {
      launches.push(createMockLaunchedToken(todayStart + i * 1000));
    }

    const count = countLaunchesToday(launches);
    const canLaunchMore = count < SAFETY_LIMITS.maxLaunchesPerDay;

    expect(canLaunchMore).toBe(false);
  });

  it("should reset count after midnight", () => {
    const todayStart = getTodayStart();
    const launches: LaunchedToken[] = [
      // Yesterday's launches (should not count)
      createMockLaunchedToken(todayStart - 1000),
      createMockLaunchedToken(todayStart - 2000),
      createMockLaunchedToken(todayStart - 3000),
      createMockLaunchedToken(todayStart - 4000),
      createMockLaunchedToken(todayStart - 5000),
      // Today's launch
      createMockLaunchedToken(todayStart + 1000),
    ];

    const count = countLaunchesToday(launches);

    expect(count).toBe(1);
  });
});
