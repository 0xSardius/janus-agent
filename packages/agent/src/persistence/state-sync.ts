import type Database from "better-sqlite3";
import type { Position, LaunchedToken } from "../types.js";
import type { LauncherState } from "../contexts/launcher.js";
import type { PositionManagerState } from "../contexts/position-manager.js";
import type { PerformanceState, PerformanceResult, CategoryPerformance } from "../performance/tracker.js";
import type { ScoringWeights } from "../performance/auto-tuner.js";
import type { GasRecord } from "../utils/gas-tracker.js";
import {
  savePosition,
  loadActivePositions,
  loadAllPositions,
  saveLaunchedToken,
  loadLaunchedTokens,
  savePerformanceResult,
  loadPerformanceResults,
  saveCategoryPerformance,
  loadCategoryPerformance,
  saveFactorCorrelation,
  loadFactorCorrelations,
  saveWeights,
  loadWeights,
  saveMeta,
  loadMeta,
  saveGasRecord,
  loadGasRecords,
  type PositionRow,
  type LaunchedTokenRow,
  type PerformanceResultRow,
} from "./database.js";

// ═══════════════════════════════════════════════════════════════════════════
// HYDRATE FROM DATABASE
// Loads DB rows into in-memory state objects at startup
// ═══════════════════════════════════════════════════════════════════════════

export interface HydrationTarget {
  launcher: LauncherState;
  positionManager: PositionManagerState;
  performanceState: PerformanceState;
}

export interface HydrationResult {
  positions: number;
  launchedTokens: number;
  performanceResults: number;
  weights: ScoringWeights | null;
  lastTuneTimestamp: number;
  gasRecords: GasRecord[];
  consecutiveFailures: number;
}

export function hydrateFromDatabase(
  db: Database.Database,
  target: HydrationTarget
): HydrationResult {
  // Load positions
  const activeRows = loadActivePositions(db);
  const allRows = loadAllPositions(db);

  for (const row of allRows) {
    const position = rowToPosition(row);
    if (row.status === "active") {
      target.positionManager.activePositions.push(position);
    } else {
      target.positionManager.closedPositions.push(position);
    }
    target.positionManager.totalInvested += position.costBasisETH;
    if (row.status !== "active") {
      target.positionManager.totalReturned += position.totalSoldETH;
    }
  }

  // Load launched tokens
  const tokenRows = loadLaunchedTokens(db);
  for (const row of tokenRows) {
    target.launcher.launchedTokens.push(rowToLaunchedToken(row));
  }

  // Restore launcher counters
  if (target.launcher.launchedTokens.length > 0) {
    const last = target.launcher.launchedTokens[target.launcher.launchedTokens.length - 1];
    target.launcher.lastLaunchTimestamp = last.launchedAt;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.launcher.dailyLaunchCount = target.launcher.launchedTokens.filter(
      (t) => t.launchedAt >= today.getTime()
    ).length;
  }

  // Load performance results
  const perfRows = loadPerformanceResults(db);
  for (const row of perfRows) {
    target.performanceState.results.push(rowToPerformanceResult(row));
  }

  // Load category performance
  const catRows = loadCategoryPerformance(db);
  for (const row of catRows) {
    target.performanceState.categoryPerformance.set(row.category, {
      totalResults: row.total_results,
      avgScore: row.avg_score,
      emaScore: row.ema_score,
    });
  }

  // Load factor correlations
  const correlations = loadFactorCorrelations(db);
  for (const [factor, value] of correlations) {
    target.performanceState.factorCorrelations.set(factor, value);
  }

  // Load weights
  const weightsRow = loadWeights(db);
  const weights = weightsRow
    ? { volume: weightsRow.volume, recency: weightsRow.recency, social: weightsRow.social, novelty: weightsRow.novelty }
    : null;

  // Load metadata
  const lastTuneStr = loadMeta(db, "lastTuneTimestamp");
  const lastTuneTimestamp = lastTuneStr ? parseInt(lastTuneStr, 10) : 0;

  const failuresStr = loadMeta(db, "consecutiveFailures");
  const consecutiveFailures = failuresStr ? parseInt(failuresStr, 10) : 0;

  // Load gas records
  const gasRows = loadGasRecords(db);
  const gasRecords: GasRecord[] = gasRows.map((r) => ({
    txHash: r.tx_hash,
    gasUsed: BigInt(r.gas_used),
    timestamp: r.timestamp,
  }));

  return {
    positions: activeRows.length,
    launchedTokens: tokenRows.length,
    performanceResults: perfRows.length,
    weights,
    lastTuneTimestamp,
    gasRecords,
    consecutiveFailures,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSIST INDIVIDUAL STATE CHANGES
// ═══════════════════════════════════════════════════════════════════════════

export function persistPosition(db: Database.Database, position: Position): void {
  savePosition(db, positionToRow(position));
}

export function persistLaunchResult(
  db: Database.Database,
  token: LaunchedToken
): void {
  saveLaunchedToken(db, launchedTokenToRow(token));
}

export function persistPerformanceResult(
  db: Database.Database,
  result: PerformanceResult
): void {
  savePerformanceResult(db, performanceResultToRow(result));
}

export function persistCategoryPerformance(
  db: Database.Database,
  category: string,
  perf: CategoryPerformance
): void {
  saveCategoryPerformance(db, {
    category,
    total_results: perf.totalResults,
    avg_score: perf.avgScore,
    ema_score: perf.emaScore,
  });
}

export function persistFactorCorrelations(
  db: Database.Database,
  correlations: Map<string, number>
): void {
  for (const [factor, value] of correlations) {
    saveFactorCorrelation(db, factor, value);
  }
}

export function persistWeights(
  db: Database.Database,
  weights: ScoringWeights
): void {
  saveWeights(db, weights);
}

export function persistMeta(
  db: Database.Database,
  key: string,
  value: string
): void {
  saveMeta(db, key, value);
}

export function persistGasRecord(
  db: Database.Database,
  record: GasRecord
): void {
  saveGasRecord(db, {
    tx_hash: record.txHash,
    gas_used: record.gasUsed.toString(),
    timestamp: record.timestamp,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW ↔ DOMAIN CONVERTERS
// ═══════════════════════════════════════════════════════════════════════════

function rowToPosition(row: PositionRow): Position {
  return {
    tokenAddress: row.token_address,
    tokenSymbol: row.token_symbol,
    entryPriceETH: BigInt(row.entry_price_eth),
    amountToken: BigInt(row.amount_token),
    costBasisETH: BigInt(row.cost_basis_eth),
    boughtAt: row.bought_at,
    tranchesSold: row.tranches_sold,
    totalSoldETH: BigInt(row.total_sold_eth),
    status: row.status as Position["status"],
    concept: row.concept ?? undefined,
  };
}

function positionToRow(position: Position): PositionRow {
  return {
    token_address: position.tokenAddress,
    token_symbol: position.tokenSymbol,
    entry_price_eth: position.entryPriceETH.toString(),
    amount_token: position.amountToken.toString(),
    cost_basis_eth: position.costBasisETH.toString(),
    bought_at: position.boughtAt,
    tranches_sold: position.tranchesSold,
    total_sold_eth: position.totalSoldETH.toString(),
    status: position.status,
    concept: position.concept ?? null,
  };
}

function rowToLaunchedToken(row: LaunchedTokenRow): LaunchedToken {
  return {
    address: row.address,
    tokenId: BigInt(row.token_id),
    name: row.name,
    symbol: row.symbol,
    launchedAt: row.launched_at,
    txHash: row.tx_hash,
    poolId: row.pool_id ?? undefined,
  };
}

function launchedTokenToRow(token: LaunchedToken): LaunchedTokenRow {
  return {
    address: token.address,
    token_id: token.tokenId.toString(),
    name: token.name,
    symbol: token.symbol,
    launched_at: token.launchedAt,
    tx_hash: token.txHash,
    pool_id: token.poolId ?? null,
  };
}

function rowToPerformanceResult(row: PerformanceResultRow): PerformanceResult {
  return {
    concept: row.concept,
    category: row.category,
    profitMultiple: row.profit_multiple,
    performanceScore: row.performance_score,
    factors:
      row.factor_volume !== null
        ? {
            volumeScore: row.factor_volume!,
            recencyScore: row.factor_recency!,
            socialScore: row.factor_social!,
            noveltyScore: row.factor_novelty!,
          }
        : undefined,
    exitAction: row.exit_action,
    timestamp: row.timestamp,
  };
}

function performanceResultToRow(
  result: PerformanceResult
): PerformanceResultRow {
  return {
    concept: result.concept,
    category: result.category,
    profit_multiple: result.profitMultiple,
    performance_score: result.performanceScore,
    factor_volume: result.factors?.volumeScore ?? null,
    factor_recency: result.factors?.recencyScore ?? null,
    factor_social: result.factors?.socialScore ?? null,
    factor_novelty: result.factors?.noveltyScore ?? null,
    exit_action: result.exitAction,
    timestamp: result.timestamp,
  };
}
