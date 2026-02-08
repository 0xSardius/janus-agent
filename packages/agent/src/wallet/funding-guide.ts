import type { PublicClient } from "viem";
import { SAFETY_LIMITS, POSITION_STRATEGY } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WalletReadinessReport {
  address: string;
  ethBalance: bigint;
  ethBalanceFormatted: string;
  isReady: boolean;
  issues: string[];
  recommendations: string[];
}

export interface FundingEstimate {
  gasReserveETH: number;
  positionCapitalETH: number;
  operatingBufferETH: number;
  emergencyReserveETH: number;
  totalRequiredETH: number;
  totalRequiredUSD: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET READINESS CHECK
// Verifies wallet has sufficient funds for autonomous operation
// ═══════════════════════════════════════════════════════════════════════════

export async function checkWalletReadiness(
  publicClient: PublicClient,
  walletAddress: `0x${string}`
): Promise<WalletReadinessReport> {
  const ethBalance = await publicClient.getBalance({ address: walletAddress });
  const ethFloat = Number(ethBalance) / 1e18;

  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check minimum balance
  const minBalanceFloat = Number(SAFETY_LIMITS.minEthBalance) / 1e18;
  if (ethBalance < SAFETY_LIMITS.minEthBalance) {
    issues.push(
      `ETH balance (${ethFloat.toFixed(4)}) below minimum (${minBalanceFloat} ETH)`
    );
    recommendations.push(
      `Fund wallet with at least ${minBalanceFloat} ETH to begin operations`
    );
  }

  // Check if can afford at least one position
  const buyAmountFloat = Number(POSITION_STRATEGY.buyAmountETH) / 1e18;
  const minForOnePosition = SAFETY_LIMITS.minEthBalance + POSITION_STRATEGY.buyAmountETH + SAFETY_LIMITS.maxSingleLaunchGas;
  if (ethBalance < minForOnePosition) {
    issues.push("Insufficient balance for even one launch + position");
    const minFloat = Number(minForOnePosition) / 1e18;
    recommendations.push(
      `Need at least ${minFloat.toFixed(4)} ETH for one launch (${minBalanceFloat} reserve + ${buyAmountFloat} position + gas)`
    );
  }

  // Check if fully funded for budget
  const fullBudgetETH = 0.065; // ~$200 at $3k ETH
  if (ethFloat < fullBudgetETH) {
    recommendations.push(
      `For full $200 budget: fund with ~${fullBudgetETH} ETH (~$200 at $3k/ETH)`
    );
  }

  // Warning for very large balances (safety concern)
  if (ethFloat > 1.0) {
    recommendations.push(
      `Balance (${ethFloat.toFixed(4)} ETH) is larger than needed. Consider reducing to limit risk.`
    );
  }

  const isReady = issues.length === 0;

  return {
    address: walletAddress,
    ethBalance,
    ethBalanceFormatted: `${ethFloat.toFixed(4)} ETH`,
    isReady,
    issues,
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING ESTIMATE
// Calculates how much ETH is needed based on the $200 budget
// ═══════════════════════════════════════════════════════════════════════════

export function estimateRequiredFunding(ethPriceUSD: number): FundingEstimate {
  // Budget breakdown from CLAUDE.md
  const gasReserveUSD = 50;
  const positionCapitalUSD = 80; // 8-10 positions at ~$8-10 each
  const operatingBufferUSD = 50;
  const emergencyReserveUSD = 20;
  const totalUSD = 200;

  return {
    gasReserveETH: gasReserveUSD / ethPriceUSD,
    positionCapitalETH: positionCapitalUSD / ethPriceUSD,
    operatingBufferETH: operatingBufferUSD / ethPriceUSD,
    emergencyReserveETH: emergencyReserveUSD / ethPriceUSD,
    totalRequiredETH: totalUSD / ethPriceUSD,
    totalRequiredUSD: totalUSD,
  };
}
