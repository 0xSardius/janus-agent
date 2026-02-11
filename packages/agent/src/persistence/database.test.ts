import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initDatabase,
  closeDatabase,
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
} from "./database.js";
import type Database from "better-sqlite3";

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase(db);
  });

  // ─── Positions ──────────────────────────────────────────────────────

  describe("positions", () => {
    it("saves and loads active positions", () => {
      savePosition(db, {
        token_address: "0xabc",
        token_symbol: "TEST",
        entry_price_eth: "1000",
        amount_token: "1000000",
        cost_basis_eth: "3000000000000000",
        bought_at: Date.now(),
        tranches_sold: 0,
        total_sold_eth: "0",
        status: "active",
        concept: "test concept",
      });

      const active = loadActivePositions(db);
      expect(active).toHaveLength(1);
      expect(active[0].token_address).toBe("0xabc");
      expect(active[0].token_symbol).toBe("TEST");
      expect(active[0].concept).toBe("test concept");
    });

    it("filters by active status", () => {
      savePosition(db, {
        token_address: "0x1",
        token_symbol: "A",
        entry_price_eth: "100",
        amount_token: "1000",
        cost_basis_eth: "100",
        bought_at: Date.now(),
        tranches_sold: 0,
        total_sold_eth: "0",
        status: "active",
        concept: null,
      });
      savePosition(db, {
        token_address: "0x2",
        token_symbol: "B",
        entry_price_eth: "100",
        amount_token: "1000",
        cost_basis_eth: "100",
        bought_at: Date.now(),
        tranches_sold: 100,
        total_sold_eth: "300",
        status: "exited",
        concept: null,
      });

      const active = loadActivePositions(db);
      expect(active).toHaveLength(1);
      expect(active[0].token_symbol).toBe("A");
    });

    it("loads all positions regardless of status", () => {
      savePosition(db, {
        token_address: "0x1",
        token_symbol: "A",
        entry_price_eth: "100",
        amount_token: "1000",
        cost_basis_eth: "100",
        bought_at: Date.now(),
        tranches_sold: 0,
        total_sold_eth: "0",
        status: "active",
        concept: null,
      });
      savePosition(db, {
        token_address: "0x2",
        token_symbol: "B",
        entry_price_eth: "100",
        amount_token: "1000",
        cost_basis_eth: "100",
        bought_at: Date.now(),
        tranches_sold: 100,
        total_sold_eth: "300",
        status: "stopped",
        concept: null,
      });

      const all = loadAllPositions(db);
      expect(all).toHaveLength(2);
    });

    it("upserts on duplicate token_address", () => {
      const base = {
        token_address: "0xabc",
        token_symbol: "TEST",
        entry_price_eth: "1000",
        amount_token: "1000000",
        cost_basis_eth: "3000000000000000",
        bought_at: Date.now(),
        tranches_sold: 0,
        total_sold_eth: "0",
        status: "active" as const,
        concept: null,
      };

      savePosition(db, base);
      savePosition(db, { ...base, tranches_sold: 25, status: "active" });

      const all = loadAllPositions(db);
      expect(all).toHaveLength(1);
      expect(all[0].tranches_sold).toBe(25);
    });
  });

  // ─── Launched Tokens ────────────────────────────────────────────────

  describe("launched tokens", () => {
    it("saves and loads launched tokens", () => {
      saveLaunchedToken(db, {
        address: "0xtoken",
        token_id: "12345",
        name: "Test Token",
        symbol: "TEST",
        launched_at: Date.now(),
        tx_hash: "0xtx",
        pool_id: "pool1",
      });

      const tokens = loadLaunchedTokens(db);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe("Test Token");
      expect(tokens[0].token_id).toBe("12345");
    });

    it("handles null pool_id", () => {
      saveLaunchedToken(db, {
        address: "0xtoken",
        token_id: "1",
        name: "Test",
        symbol: "T",
        launched_at: Date.now(),
        tx_hash: "0x",
        pool_id: null,
      });

      const tokens = loadLaunchedTokens(db);
      expect(tokens[0].pool_id).toBeNull();
    });
  });

  // ─── Performance Results ────────────────────────────────────────────

  describe("performance results", () => {
    it("saves and loads performance results", () => {
      savePerformanceResult(db, {
        concept: "DOGE",
        category: "animal",
        profit_multiple: 3.0,
        performance_score: 0.8,
        factor_volume: 0.7,
        factor_recency: 0.9,
        factor_social: 0.5,
        factor_novelty: 0.6,
        exit_action: "TAKE_PROFIT_3x",
        timestamp: Date.now(),
      });

      const results = loadPerformanceResults(db);
      expect(results).toHaveLength(1);
      expect(results[0].concept).toBe("DOGE");
      expect(results[0].profit_multiple).toBe(3.0);
    });

    it("handles null factor scores", () => {
      savePerformanceResult(db, {
        concept: "TEST",
        category: "other",
        profit_multiple: 1.5,
        performance_score: 0.55,
        factor_volume: null,
        factor_recency: null,
        factor_social: null,
        factor_novelty: null,
        exit_action: "TIME_EXIT",
        timestamp: Date.now(),
      });

      const results = loadPerformanceResults(db);
      expect(results[0].factor_volume).toBeNull();
    });

    it("preserves insertion order by timestamp", () => {
      const now = Date.now();
      savePerformanceResult(db, {
        concept: "SECOND",
        category: "other",
        profit_multiple: 2,
        performance_score: 0.7,
        factor_volume: null,
        factor_recency: null,
        factor_social: null,
        factor_novelty: null,
        exit_action: "EXIT",
        timestamp: now + 1000,
      });
      savePerformanceResult(db, {
        concept: "FIRST",
        category: "other",
        profit_multiple: 1,
        performance_score: 0.5,
        factor_volume: null,
        factor_recency: null,
        factor_social: null,
        factor_novelty: null,
        exit_action: "EXIT",
        timestamp: now,
      });

      const results = loadPerformanceResults(db);
      expect(results[0].concept).toBe("FIRST");
      expect(results[1].concept).toBe("SECOND");
    });
  });

  // ─── Category Performance ───────────────────────────────────────────

  describe("category performance", () => {
    it("saves and loads category performance", () => {
      saveCategoryPerformance(db, {
        category: "animal",
        total_results: 5,
        avg_score: 0.72,
        ema_score: 0.68,
      });

      const cats = loadCategoryPerformance(db);
      expect(cats).toHaveLength(1);
      expect(cats[0].category).toBe("animal");
      expect(cats[0].avg_score).toBeCloseTo(0.72);
    });

    it("upserts on duplicate category", () => {
      saveCategoryPerformance(db, {
        category: "ai",
        total_results: 2,
        avg_score: 0.5,
        ema_score: 0.5,
      });
      saveCategoryPerformance(db, {
        category: "ai",
        total_results: 3,
        avg_score: 0.6,
        ema_score: 0.55,
      });

      const cats = loadCategoryPerformance(db);
      expect(cats).toHaveLength(1);
      expect(cats[0].total_results).toBe(3);
    });
  });

  // ─── Factor Correlations ───────────────────────────────────────────

  describe("factor correlations", () => {
    it("saves and loads correlations", () => {
      saveFactorCorrelation(db, "volume", 0.35);
      saveFactorCorrelation(db, "recency", 0.28);

      const correlations = loadFactorCorrelations(db);
      expect(correlations.get("volume")).toBeCloseTo(0.35);
      expect(correlations.get("recency")).toBeCloseTo(0.28);
    });

    it("upserts on duplicate factor", () => {
      saveFactorCorrelation(db, "social", 0.1);
      saveFactorCorrelation(db, "social", 0.4);

      const correlations = loadFactorCorrelations(db);
      expect(correlations.get("social")).toBeCloseTo(0.4);
    });
  });

  // ─── Scoring Weights ───────────────────────────────────────────────

  describe("scoring weights", () => {
    it("saves and loads weights", () => {
      saveWeights(db, {
        volume: 0.3,
        recency: 0.25,
        social: 0.25,
        novelty: 0.2,
      });

      const weights = loadWeights(db);
      expect(weights).not.toBeNull();
      expect(weights!.volume).toBeCloseTo(0.3);
      expect(weights!.novelty).toBeCloseTo(0.2);
    });

    it("returns null when no weights saved", () => {
      const weights = loadWeights(db);
      expect(weights).toBeNull();
    });

    it("upserts weights (only one row)", () => {
      saveWeights(db, { volume: 0.3, recency: 0.25, social: 0.25, novelty: 0.2 });
      saveWeights(db, { volume: 0.4, recency: 0.2, social: 0.2, novelty: 0.2 });

      const weights = loadWeights(db);
      expect(weights!.volume).toBeCloseTo(0.4);
    });
  });

  // ─── Agent Metadata ─────────────────────────────────────────────────

  describe("agent metadata", () => {
    it("saves and loads metadata", () => {
      saveMeta(db, "lastTuneTimestamp", "1700000000000");

      const value = loadMeta(db, "lastTuneTimestamp");
      expect(value).toBe("1700000000000");
    });

    it("returns null for missing key", () => {
      expect(loadMeta(db, "nonexistent")).toBeNull();
    });

    it("upserts on duplicate key", () => {
      saveMeta(db, "key1", "value1");
      saveMeta(db, "key1", "value2");

      expect(loadMeta(db, "key1")).toBe("value2");
    });
  });

  // ─── Gas Records ────────────────────────────────────────────────────

  describe("gas records", () => {
    it("saves and loads gas records", () => {
      saveGasRecord(db, {
        tx_hash: "0xgas1",
        gas_used: "630000000000000",
        timestamp: Date.now(),
      });

      const records = loadGasRecords(db);
      expect(records).toHaveLength(1);
      expect(records[0].tx_hash).toBe("0xgas1");
      expect(records[0].gas_used).toBe("630000000000000");
    });

    it("preserves order by timestamp", () => {
      const now = Date.now();
      saveGasRecord(db, { tx_hash: "0x2", gas_used: "200", timestamp: now + 1000 });
      saveGasRecord(db, { tx_hash: "0x1", gas_used: "100", timestamp: now });

      const records = loadGasRecords(db);
      expect(records[0].tx_hash).toBe("0x1");
      expect(records[1].tx_hash).toBe("0x2");
    });
  });
});
