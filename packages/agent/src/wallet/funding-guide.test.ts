import { describe, it, expect, vi } from "vitest";
import { parseEther } from "viem";
import {
  checkWalletReadiness,
  estimateRequiredFunding,
} from "./funding-guide.js";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK PUBLIC CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function createMockPublicClient(balance: bigint) {
  return {
    getBalance: vi.fn().mockResolvedValue(balance),
  };
}

const MOCK_WALLET = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════
// WALLET READINESS TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("checkWalletReadiness", () => {
  it("should report ready when balance is sufficient", async () => {
    const client = createMockPublicClient(parseEther("0.5"));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.isReady).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.address).toBe(MOCK_WALLET);
  });

  it("should report not ready when balance is below minimum", async () => {
    const client = createMockPublicClient(parseEther("0.05"));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.isReady).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0]).toContain("below minimum");
  });

  it("should report issue when can't afford one position", async () => {
    const client = createMockPublicClient(parseEther("0.11")); // Above min but not enough for launch+buy

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.issues).toContainEqual(
      expect.stringContaining("Insufficient balance")
    );
  });

  it("should include funding recommendation for low balance", async () => {
    const client = createMockPublicClient(parseEther("0.01"));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("should recommend reducing large balances", async () => {
    const client = createMockPublicClient(parseEther("5.0"));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.recommendations).toContainEqual(
      expect.stringContaining("larger than needed")
    );
  });

  it("should include formatted balance", async () => {
    const client = createMockPublicClient(parseEther("0.5"));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.ethBalanceFormatted).toBe("0.5000 ETH");
  });

  it("should return raw bigint balance", async () => {
    const balance = parseEther("0.5");
    const client = createMockPublicClient(balance);

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.ethBalance).toBe(balance);
  });

  it("should report zero balance as not ready", async () => {
    const client = createMockPublicClient(BigInt(0));

    const report = await checkWalletReadiness(client as any, MOCK_WALLET);

    expect(report.isReady).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING ESTIMATE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("estimateRequiredFunding", () => {
  it("should calculate estimates at $3000/ETH", () => {
    const estimate = estimateRequiredFunding(3000);

    expect(estimate.totalRequiredUSD).toBe(200);
    expect(estimate.totalRequiredETH).toBeCloseTo(0.0667, 3);
  });

  it("should calculate estimates at $2000/ETH", () => {
    const estimate = estimateRequiredFunding(2000);

    expect(estimate.totalRequiredETH).toBeCloseTo(0.1, 3);
  });

  it("should break down budget correctly", () => {
    const estimate = estimateRequiredFunding(1000);

    expect(estimate.gasReserveETH).toBe(0.05); // $50 / $1000
    expect(estimate.positionCapitalETH).toBe(0.08); // $80 / $1000
    expect(estimate.operatingBufferETH).toBe(0.05); // $50 / $1000
    expect(estimate.emergencyReserveETH).toBe(0.02); // $20 / $1000
  });

  it("should sum up to total", () => {
    const estimate = estimateRequiredFunding(3000);

    const sum =
      estimate.gasReserveETH +
      estimate.positionCapitalETH +
      estimate.operatingBufferETH +
      estimate.emergencyReserveETH;

    expect(sum).toBeCloseTo(estimate.totalRequiredETH, 10);
  });
});
