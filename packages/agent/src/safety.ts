import type { CdpWalletProvider } from "@coinbase/agentkit";
import type { PublicClient } from "viem";
import { SAFETY_LIMITS } from "./constants.js";
import type { AgentState, LaunchedToken } from "./types.js";
import { existsSync } from "fs";

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY CHECK RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SAFETY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export async function checkSafetyConditions(
  walletProvider: CdpWalletProvider,
  publicClient: PublicClient,
  agentState: AgentState
): Promise<SafetyCheckResult> {
  // Check emergency stop file
  if (existsSync(SAFETY_LIMITS.emergencyStopFile)) {
    return { safe: false, reason: "Emergency stop file detected" };
  }

  // Check ETH balance
  const balance = BigInt(await walletProvider.getBalance());
  if (balance < SAFETY_LIMITS.minEthBalance) {
    return {
      safe: false,
      reason: `ETH balance too low: ${balance} < ${SAFETY_LIMITS.minEthBalance}`,
    };
  }

  // Check daily gas spend
  if (agentState.dailyGasSpent > SAFETY_LIMITS.maxDailyGasSpend) {
    return { safe: false, reason: "Daily gas limit reached" };
  }

  // Check launches today
  if (agentState.todayLaunchCount >= SAFETY_LIMITS.maxLaunchesPerDay) {
    return { safe: false, reason: "Daily launch limit reached" };
  }

  // Check consecutive failures
  if (agentState.consecutiveFailures >= SAFETY_LIMITS.maxConsecutiveFailures) {
    return {
      safe: false,
      reason: "Too many consecutive failures - manual review needed",
    };
  }

  // Check gas price
  const gasPrice = await publicClient.getGasPrice();
  const maxGasPriceWei = BigInt(SAFETY_LIMITS.pauseOnHighGas) * BigInt(1e9);
  if (gasPrice > maxGasPriceWei) {
    return {
      safe: false,
      reason: `Gas price too high: ${Number(gasPrice) / 1e9} gwei`,
    };
  }

  return { safe: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function calculateTodayGasSpend(launchedTokens: LaunchedToken[]): bigint {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  // This would need to track actual gas spent per transaction
  // For now, estimate based on launch count
  const todayLaunches = launchedTokens.filter(
    (t) => t.launchedAt >= todayStart
  );
  // Rough estimate: 0.01 ETH per launch
  return BigInt(todayLaunches.length) * BigInt(1e16);
}

export function countLaunchesToday(launchedTokens: LaunchedToken[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return launchedTokens.filter((t) => t.launchedAt >= todayStart).length;
}

export function canLaunchNow(
  lastLaunchTimestamp: number,
  minTimeBetweenLaunches: number = SAFETY_LIMITS.minTimeBetweenLaunches
): boolean {
  const elapsed = Date.now() - lastLaunchTimestamp;
  return elapsed >= minTimeBetweenLaunches;
}

export function isWithinPortfolioLimit(
  currentExposure: bigint,
  newPosition: bigint,
  walletBalance: bigint
): boolean {
  const maxExposure =
    (walletBalance * BigInt(Math.floor(SAFETY_LIMITS.maxPortfolioExposure * 100))) /
    BigInt(100);
  return currentExposure + newPosition <= maxExposure;
}
