import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import {
  initDatabase,
  closeDatabase,
  saveLaunchedToken,
  savePosition,
  savePerformanceResult,
  saveCategoryPerformance,
  saveFactorCorrelation,
  saveWeights,
  saveMeta,
  saveGasRecord,
} from "./database.js";
import {
  hydrateFromDatabase,
  persistPosition,
  persistLaunchResult,
  persistPerformanceResult,
  persistWeights,
  persistMeta,
  persistGasRecord,
  type HydrationTarget,
} from "./state-sync.js";
import { createLauncherState } from "../contexts/launcher.js";
import { createPositionManagerState } from "../contexts/position-manager.js";
import { createPerformanceState } from "../performance/tracker.js";

describe("state-sync", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase(db);
  });

  function makeTarget(): HydrationTarget {
    return {
      launcher: createLauncherState(),
      positionManager: createPositionManagerState(),
      performanceState: createPerformanceState(),
    };
  }

  // ─── Hydration ──────────────────────────────────────────────────────

  describe("hydrateFromDatabase", () => {
    it("hydrates empty database", () => {
      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.positions).toBe(0);
      expect(result.launchedTokens).toBe(0);
      expect(result.performanceResults).toBe(0);
      expect(result.weights).toBeNull();
      expect(result.lastTuneTimestamp).toBe(0);
      expect(result.consecutiveFailures).toBe(0);
      expect(result.gasRecords).toHaveLength(0);
    });

    it("hydrates positions into position manager", () => {
      savePosition(db, {
        token_address: "0xactive",
        token_symbol: "ACT",
        entry_price_eth: "1000",
        amount_token: "5000",
        cost_basis_eth: "3000000000000000",
        bought_at: Date.now(),
        tranches_sold: 0,
        total_sold_eth: "0",
        status: "active",
        concept: "test",
      });
      savePosition(db, {
        token_address: "0xclosed",
        token_symbol: "CLS",
        entry_price_eth: "2000",
        amount_token: "0",
        cost_basis_eth: "3000000000000000",
        bought_at: Date.now() - 86400000,
        tranches_sold: 100,
        total_sold_eth: "9000000000000000",
        status: "exited",
        concept: null,
      });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.positions).toBe(1); // only active count
      expect(target.positionManager.activePositions).toHaveLength(1);
      expect(target.positionManager.closedPositions).toHaveLength(1);
      expect(target.positionManager.activePositions[0].tokenSymbol).toBe("ACT");
      expect(target.positionManager.closedPositions[0].tokenSymbol).toBe("CLS");
    });

    it("hydrates launched tokens into launcher", () => {
      const now = Date.now();
      saveLaunchedToken(db, {
        address: "0xtoken",
        token_id: "42",
        name: "Test Token",
        symbol: "TEST",
        launched_at: now,
        tx_hash: "0xtx",
        pool_id: "pool1",
      });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.launchedTokens).toBe(1);
      expect(target.launcher.launchedTokens).toHaveLength(1);
      expect(target.launcher.launchedTokens[0].tokenId).toBe(BigInt(42));
      expect(target.launcher.lastLaunchTimestamp).toBe(now);
    });

    it("hydrates performance results", () => {
      savePerformanceResult(db, {
        concept: "DOGE",
        category: "animal",
        profit_multiple: 3.0,
        performance_score: 0.8,
        factor_volume: 0.7,
        factor_recency: 0.9,
        factor_social: 0.5,
        factor_novelty: 0.6,
        exit_action: "TAKE_PROFIT",
        timestamp: Date.now(),
      });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.performanceResults).toBe(1);
      expect(target.performanceState.results).toHaveLength(1);
      expect(target.performanceState.results[0].concept).toBe("DOGE");
    });

    it("hydrates category performance and factor correlations", () => {
      saveCategoryPerformance(db, {
        category: "animal",
        total_results: 5,
        avg_score: 0.7,
        ema_score: 0.65,
      });
      saveFactorCorrelation(db, "volume", 0.35);
      saveFactorCorrelation(db, "social", 0.22);

      const target = makeTarget();
      hydrateFromDatabase(db, target);

      expect(target.performanceState.categoryPerformance.get("animal")?.totalResults).toBe(5);
      expect(target.performanceState.factorCorrelations.get("volume")).toBeCloseTo(0.35);
      expect(target.performanceState.factorCorrelations.get("social")).toBeCloseTo(0.22);
    });

    it("hydrates weights and metadata", () => {
      saveWeights(db, { volume: 0.35, recency: 0.2, social: 0.3, novelty: 0.15 });
      saveMeta(db, "lastTuneTimestamp", "1700000000000");
      saveMeta(db, "consecutiveFailures", "2");

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.weights).not.toBeNull();
      expect(result.weights!.volume).toBeCloseTo(0.35);
      expect(result.lastTuneTimestamp).toBe(1700000000000);
      expect(result.consecutiveFailures).toBe(2);
    });

    it("hydrates gas records", () => {
      saveGasRecord(db, { tx_hash: "0xgas", gas_used: "500000000000000", timestamp: Date.now() });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.gasRecords).toHaveLength(1);
      expect(result.gasRecords[0].gasUsed).toBe(BigInt("500000000000000"));
    });
  });

  // ─── Persistence ────────────────────────────────────────────────────

  describe("persist helpers", () => {
    it("persistPosition round-trips a Position", () => {
      persistPosition(db, {
        tokenAddress: "0xtest",
        tokenSymbol: "TST",
        entryPriceETH: BigInt(1000),
        amountToken: BigInt(50000),
        costBasisETH: BigInt(3000000000000000),
        boughtAt: Date.now(),
        tranchesSold: 25,
        totalSoldETH: BigInt(0),
        status: "active",
        concept: "test concept",
      });

      const target = makeTarget();
      hydrateFromDatabase(db, target);

      const pos = target.positionManager.activePositions[0];
      expect(pos.tokenAddress).toBe("0xtest");
      expect(pos.entryPriceETH).toBe(BigInt(1000));
      expect(pos.concept).toBe("test concept");
    });

    it("persistLaunchResult round-trips a LaunchedToken", () => {
      persistLaunchResult(db, {
        address: "0xtoken",
        tokenId: BigInt(99),
        name: "My Token",
        symbol: "MTK",
        launchedAt: Date.now(),
        txHash: "0xhash",
        poolId: "poolA",
      });

      const target = makeTarget();
      hydrateFromDatabase(db, target);

      expect(target.launcher.launchedTokens[0].tokenId).toBe(BigInt(99));
      expect(target.launcher.launchedTokens[0].name).toBe("My Token");
    });

    it("persistPerformanceResult round-trips", () => {
      persistPerformanceResult(db, {
        concept: "AI TOKEN",
        category: "ai",
        profitMultiple: 5.2,
        performanceScore: 0.88,
        factors: { volumeScore: 0.8, recencyScore: 0.7, socialScore: 0.6, noveltyScore: 0.5 },
        exitAction: "TAKE_PROFIT_5x",
        timestamp: Date.now(),
      });

      const target = makeTarget();
      hydrateFromDatabase(db, target);

      const result = target.performanceState.results[0];
      expect(result.concept).toBe("AI TOKEN");
      expect(result.factors?.volumeScore).toBe(0.8);
    });

    it("persistWeights round-trips", () => {
      persistWeights(db, { volume: 0.28, recency: 0.22, social: 0.30, novelty: 0.20 });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.weights!.volume).toBeCloseTo(0.28);
      expect(result.weights!.social).toBeCloseTo(0.30);
    });

    it("persistGasRecord round-trips", () => {
      persistGasRecord(db, {
        txHash: "0xgas123",
        gasUsed: BigInt("800000000000000"),
        timestamp: Date.now(),
      });

      const target = makeTarget();
      const result = hydrateFromDatabase(db, target);

      expect(result.gasRecords[0].txHash).toBe("0xgas123");
      expect(result.gasRecords[0].gasUsed).toBe(BigInt("800000000000000"));
    });
  });
});
