import type { PublicClient, WalletClient, Hash } from "viem";
import { parseEther, formatEther } from "viem";
import type { Position, PositionExitResult } from "../types.js";
import { POSITION_STRATEGY, SAFETY_LIMITS } from "../constants.js";
import { createFlaunchWrapper } from "../flaunch/client.js";
import { parseSwapReceiptForTokens, parseSwapReceiptForETH as parseReceiptForETH } from "../flaunch/receipt-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// POSITION MANAGER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface PositionManagerState {
  activePositions: Position[];
  closedPositions: Position[];
  totalInvested: bigint;
  totalReturned: bigint;
}

export function createPositionManagerState(): PositionManagerState {
  return {
    activePositions: [],
    closedPositions: [],
    totalInvested: BigInt(0),
    totalReturned: BigInt(0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface BuyResult {
  success: boolean;
  txHash?: Hash;
  tokensReceived?: bigint;
  costBasisETH?: bigint;
  reason?: string;
}

/**
 * Buy a position in a token immediately after launch
 */
export async function buyOwnToken(
  state: PositionManagerState,
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  publicClient: PublicClient,
  walletClient: WalletClient,
  walletAddress: `0x${string}`,
  amountETH?: bigint
): Promise<BuyResult> {
  const buyAmount = amountETH || POSITION_STRATEGY.buyAmountETH;

  // Safety: Check max active positions
  if (state.activePositions.length >= POSITION_STRATEGY.maxActivePositions) {
    return {
      success: false,
      reason: `Max active positions reached (${POSITION_STRATEGY.maxActivePositions})`,
    };
  }

  // Safety: Check portfolio exposure
  const walletBalance = await publicClient.getBalance({ address: walletAddress });
  const currentExposure = state.activePositions.reduce(
    (sum, p) => sum + p.costBasisETH,
    BigInt(0)
  );

  const maxExposure =
    (walletBalance * BigInt(Math.floor(POSITION_STRATEGY.maxPortfolioExposure * 100))) /
    BigInt(100);

  if (currentExposure + buyAmount > maxExposure) {
    return {
      success: false,
      reason: `Portfolio exposure limit reached (${POSITION_STRATEGY.maxPortfolioExposure * 100}% of wallet)`,
    };
  }

  // Safety: Don't exceed max buy per token
  if (buyAmount > SAFETY_LIMITS.maxBuyPerToken) {
    return {
      success: false,
      reason: `Buy amount exceeds max per token: ${formatEther(buyAmount)} > ${formatEther(SAFETY_LIMITS.maxBuyPerToken)}`,
    };
  }

  try {
    const flaunch = createFlaunchWrapper(publicClient, walletClient);

    // Execute buy via Flaunch SDK (ETH → token)
    const hash = await flaunch.buyCoin({
      coinAddress: tokenAddress,
      amountIn: buyAmount,
      slippagePercent: 5, // 5% slippage tolerance for new tokens
    });

    // Wait for transaction and parse tokens received
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tokensReceived = parseSwapReceiptForTokens(receipt, tokenAddress, walletAddress);

    // Calculate entry price
    const entryPrice = tokensReceived > BigInt(0)
      ? buyAmount / tokensReceived
      : BigInt(0);

    // Track position
    const position: Position = {
      tokenAddress,
      tokenSymbol,
      entryPriceETH: entryPrice,
      amountToken: tokensReceived,
      costBasisETH: buyAmount,
      boughtAt: Date.now(),
      tranchesSold: 0,
      totalSoldETH: BigInt(0),
      status: "active",
    };

    state.activePositions.push(position);
    state.totalInvested += buyAmount;

    return {
      success: true,
      txHash: hash,
      tokensReceived,
      costBasisETH: buyAmount,
    };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR & EXIT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface MonitorResult {
  checked: number;
  exits: PositionExitResult[];
  activePositions: number;
}

/**
 * Check all active positions for exit conditions
 */
export async function monitorPositions(
  state: PositionManagerState,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<MonitorResult> {
  const results: PositionExitResult[] = [];

  for (const position of state.activePositions) {
    if (position.status !== "active") continue;

    // Get current token price
    const currentPrice = await getTokenPriceETH(position.tokenAddress);
    const multiple =
      position.entryPriceETH > BigInt(0)
        ? Number(currentPrice) / Number(position.entryPriceETH)
        : 0;
    const holdDuration = Date.now() - position.boughtAt;

    // ─── Check Stop Loss ───
    if (multiple <= POSITION_STRATEGY.stopLossMultiple) {
      const sellResult = await executeSell(
        position,
        100,
        publicClient,
        walletClient
      );
      position.status = "stopped";
      position.totalSoldETH += sellResult.ethReceived;
      state.totalReturned += sellResult.ethReceived;

      results.push({
        token: position.tokenSymbol,
        action: "STOP_LOSS",
        multiple: multiple.toFixed(2),
        ethReceived: formatEther(sellResult.ethReceived),
      });
      continue;
    }

    // ─── Check Time-Based Exit ───
    if (holdDuration > POSITION_STRATEGY.maxHoldDuration) {
      const sellResult = await executeSell(
        position,
        100,
        publicClient,
        walletClient
      );
      position.status = "exited";
      position.totalSoldETH += sellResult.ethReceived;
      state.totalReturned += sellResult.ethReceived;

      results.push({
        token: position.tokenSymbol,
        action: "TIME_EXIT",
        multiple: multiple.toFixed(2),
        ethReceived: formatEther(sellResult.ethReceived),
      });
      continue;
    }

    // ─── Check Staged Profit-Taking ───
    for (const tranche of POSITION_STRATEGY.sellTranches) {
      // Calculate cumulative percent sold threshold
      const targetCumulativePercent = POSITION_STRATEGY.sellTranches
        .filter((t) => t.triggerMultiple <= tranche.triggerMultiple)
        .reduce((sum, t) => sum + t.sellPercent, 0);

      if (
        multiple >= tranche.triggerMultiple &&
        position.tranchesSold < targetCumulativePercent
      ) {
        const sellResult = await executeSell(
          position,
          tranche.sellPercent,
          publicClient,
          walletClient
        );
        position.tranchesSold += tranche.sellPercent;
        position.amountToken -= sellResult.tokensSold;
        position.totalSoldETH += sellResult.ethReceived;
        state.totalReturned += sellResult.ethReceived;

        // If all tranches sold, mark as exited
        if (position.tranchesSold >= 100) {
          position.status = "exited";
        }

        results.push({
          token: position.tokenSymbol,
          action: `TAKE_PROFIT_${tranche.triggerMultiple}x`,
          multiple: multiple.toFixed(2),
          percentSold: tranche.sellPercent,
          ethReceived: formatEther(sellResult.ethReceived),
        });
      }
    }
  }

  // Move fully exited positions to closed
  const exited = state.activePositions.filter(
    (p) => p.status === "exited" || p.status === "stopped"
  );
  state.closedPositions.push(...exited);
  state.activePositions = state.activePositions.filter(
    (p) => p.status === "active"
  );

  return {
    checked: state.activePositions.length + exited.length,
    exits: results,
    activePositions: state.activePositions.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface PortfolioStatus {
  activePositions: number;
  closedPositions: number;
  totalInvestedETH: string;
  totalReturnedETH: string;
  unrealizedValueETH: string;
  realizedPnL: string;
  totalPnL: string;
}

export async function getPortfolioStatus(
  state: PositionManagerState
): Promise<PortfolioStatus> {
  // Calculate unrealized P&L for active positions
  let unrealizedValueETH = BigInt(0);
  for (const position of state.activePositions) {
    const currentPrice = await getTokenPriceETH(position.tokenAddress);
    unrealizedValueETH += currentPrice * position.amountToken;
  }

  const realizedPnL = state.totalReturned - state.totalInvested;

  return {
    activePositions: state.activePositions.length,
    closedPositions: state.closedPositions.length,
    totalInvestedETH: formatEther(state.totalInvested),
    totalReturnedETH: formatEther(state.totalReturned),
    unrealizedValueETH: formatEther(unrealizedValueETH),
    realizedPnL: formatEther(realizedPnL),
    totalPnL: formatEther(realizedPnL + unrealizedValueETH),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

interface SellResult {
  ethReceived: bigint;
  tokensSold: bigint;
}

async function executeSell(
  position: Position,
  percentToSell: number,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<SellResult> {
  const tokensToSell =
    (position.amountToken * BigInt(percentToSell)) / BigInt(100);

  const flaunch = createFlaunchWrapper(publicClient, walletClient);

  const hash = await flaunch.sellCoin({
    coinAddress: position.tokenAddress as `0x${string}`,
    amountIn: tokensToSell,
    slippagePercent: 5,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const ethReceived = parseReceiptForETH(receipt);

  return { ethReceived, tokensSold: tokensToSell };
}

async function getTokenPriceETH(tokenAddress: string): Promise<bigint> {
  const subgraphUrl = process.env.FLAUNCH_SUBGRAPH_URL;
  if (!subgraphUrl) {
    throw new Error("FLAUNCH_SUBGRAPH_URL not set");
  }

  const query = `
    query TokenPrice($token: String!) {
      pools(where: { memecoin_: { address: $token } }) {
        sqrtPriceX96
        tick
      }
    }
  `;

  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { token: tokenAddress.toLowerCase() },
    }),
  });

  const result = await response.json() as { data?: { pools?: Array<{ sqrtPriceX96: string }> } };
  if (!result.data?.pools?.[0]) {
    return BigInt(0);
  }

  return calculatePriceFromSqrtPriceX96(result.data.pools[0].sqrtPriceX96);
}

function calculatePriceFromSqrtPriceX96(sqrtPriceX96: string): bigint {
  // sqrtPriceX96 = sqrt(price) * 2^96
  // price = (sqrtPriceX96 / 2^96)^2
  const sqrtPrice = BigInt(sqrtPriceX96);
  const Q96 = BigInt(2) ** BigInt(96);
  // This is a simplified calculation - may need adjustment for precision
  return (sqrtPrice * sqrtPrice) / (Q96 * Q96);
}

