import type { PublicClient, WalletClient, Hash } from "viem";
import { parseEther } from "viem";
import type { LaunchedToken, TokenMetadata } from "../types.js";
import { SAFETY_LIMITS } from "../constants.js";
import { createFlaunchWrapper, type FlaunchClient } from "../flaunch/client.js";

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCHER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface LauncherState {
  launchedTokens: LaunchedToken[];
  totalRevenue: bigint;
  pendingClaims: string[];
  lastLaunchTimestamp: number;
  dailyLaunchCount: number;
}

export function createLauncherState(): LauncherState {
  return {
    launchedTokens: [],
    totalRevenue: BigInt(0),
    pendingClaims: [],
    lastLaunchTimestamp: 0,
    dailyLaunchCount: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export interface LaunchConfig {
  name: string;
  symbol: string;
  description: string;
  base64Image?: string;
  initialMarketCapUSD?: number;
  fairLaunchDuration?: number;
  creatorFeePercent?: number;
}

export interface LaunchResult {
  success: boolean;
  txHash?: Hash;
  tokenAddress?: `0x${string}`;
  tokenId?: bigint;
  poolId?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCHER ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Launch a new token on Flaunch
 */
export async function launchToken(
  state: LauncherState,
  config: LaunchConfig,
  publicClient: PublicClient,
  walletClient: WalletClient,
  walletAddress: `0x${string}`
): Promise<LaunchResult> {
  // Safety checks
  const timeSinceLastLaunch = Date.now() - state.lastLaunchTimestamp;
  if (timeSinceLastLaunch < SAFETY_LIMITS.minTimeBetweenLaunches) {
    const waitMinutes = Math.ceil(
      (SAFETY_LIMITS.minTimeBetweenLaunches - timeSinceLastLaunch) / 60000
    );
    return {
      success: false,
      error: `Cooldown active. Wait ${waitMinutes} more minutes.`,
    };
  }

  // Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLaunches = state.launchedTokens.filter(
    (t) => t.launchedAt >= today.getTime()
  ).length;

  if (todayLaunches >= SAFETY_LIMITS.maxLaunchesPerDay) {
    return {
      success: false,
      error: `Daily launch limit reached (${SAFETY_LIMITS.maxLaunchesPerDay})`,
    };
  }

  // Check gas balance
  const balance = await publicClient.getBalance({ address: walletAddress });
  if (balance < SAFETY_LIMITS.minEthBalance) {
    return {
      success: false,
      error: `Insufficient ETH balance: ${balance}`,
    };
  }

  try {
    const flaunch = createFlaunchWrapper(publicClient, walletClient);

    // Execute launch
    const hash = await flaunch.flaunchIPFS({
      name: config.name,
      symbol: config.symbol.slice(0, 6), // Flaunch symbol limit
      fairLaunchPercent: 0,
      fairLaunchDuration: config.fairLaunchDuration || 30 * 60, // 30 min default
      initialMarketCapUSD: config.initialMarketCapUSD || 10_000,
      creator: walletAddress,
      creatorFeeAllocationPercent: config.creatorFeePercent || 100,
      metadata: {
        base64Image: config.base64Image,
        description: config.description,
      },
    });

    // Set cooldown immediately after tx is submitted to prevent rapid-fire launches.
    // This ensures the 2-hour cooldown kicks in even if receipt parsing fails.
    state.lastLaunchTimestamp = Date.now();
    state.dailyLaunchCount++;

    // Parse transaction to get token data
    const poolData = await flaunch.getPoolCreatedFromTx(hash);

    if (poolData) {
      const launchedToken: LaunchedToken = {
        address: poolData.memecoin,
        tokenId: poolData.tokenId,
        name: config.name,
        symbol: config.symbol,
        launchedAt: Date.now(),
        txHash: hash,
        poolId: poolData.poolId,
      };

      state.launchedTokens.push(launchedToken);

      return {
        success: true,
        txHash: hash,
        tokenAddress: poolData.memecoin,
        tokenId: poolData.tokenId,
        poolId: poolData.poolId,
      };
    }

    return {
      success: true,
      txHash: hash,
      error: "Transaction sent but could not parse pool creation event",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Claim accumulated trading fees from a launched token
 */
export async function claimRevenue(
  state: LauncherState,
  tokenId: bigint,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<{ success: boolean; txHash?: Hash; error?: string }> {
  try {
    const flaunch = createFlaunchWrapper(publicClient, walletClient);
    const hash = await flaunch.withdrawCreatorRevenue();

    // Remove from pending claims
    state.pendingClaims = state.pendingClaims.filter(
      (id) => id !== tokenId.toString()
    );

    return { success: true, txHash: hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Claim fees from all launched tokens with pending revenue
 */
export async function claimAllRevenue(
  state: LauncherState,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<{ claimed: number; failed: number; totalGas: bigint }> {
  let claimed = 0;
  let failed = 0;
  let totalGas = BigInt(0);

  for (const token of state.launchedTokens) {
    try {
      const result = await claimRevenue(
        state,
        token.tokenId,
        publicClient,
        walletClient
      );
      if (result.success) {
        claimed++;
        // Estimate gas cost
        totalGas += parseEther("0.001");
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { claimed, failed, totalGas };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all tokens launched by this agent
 */
export function getLaunchedTokens(state: LauncherState): LaunchedToken[] {
  return [...state.launchedTokens];
}

/**
 * Check if we can launch (cooldown + daily limit)
 */
export function canLaunch(state: LauncherState): {
  canLaunch: boolean;
  reason?: string;
} {
  const timeSinceLastLaunch = Date.now() - state.lastLaunchTimestamp;
  if (timeSinceLastLaunch < SAFETY_LIMITS.minTimeBetweenLaunches) {
    const waitMinutes = Math.ceil(
      (SAFETY_LIMITS.minTimeBetweenLaunches - timeSinceLastLaunch) / 60000
    );
    return {
      canLaunch: false,
      reason: `Cooldown: ${waitMinutes} minutes remaining`,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLaunches = state.launchedTokens.filter(
    (t) => t.launchedAt >= today.getTime()
  ).length;

  if (todayLaunches >= SAFETY_LIMITS.maxLaunchesPerDay) {
    return {
      canLaunch: false,
      reason: `Daily limit reached: ${todayLaunches}/${SAFETY_LIMITS.maxLaunchesPerDay}`,
    };
  }

  return { canLaunch: true };
}

/**
 * Reset daily counters (call at midnight UTC)
 */
export function resetDailyCounters(state: LauncherState): void {
  state.dailyLaunchCount = 0;
}
