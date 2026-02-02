import { describe, it, expect, beforeEach } from "vitest";
import {
  createMonitorState,
  extractTrendingConcepts,
  calculateVolumeVelocity,
  filterViablePools,
  type MonitorState,
} from "./monitor.js";
import type { PoolData } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

function createMockPool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    id: "pool-1",
    memecoin: {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      symbol: "TEST",
      name: "Test Token",
    },
    volumeETH: "1.5",
    volumeUSD: "4500",
    createdAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createMonitorState", () => {
  it("should create initial state with empty values", () => {
    const state = createMonitorState();

    expect(state.lastPollTimestamp).toBe(0);
    expect(state.recentTokens).toEqual([]);
    expect(state.trendingConcepts).toEqual([]);
    expect(state.seenTokenIds.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT EXTRACTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("extractTrendingConcepts", () => {
  let state: MonitorState;

  beforeEach(() => {
    state = createMonitorState();
  });

  it("should return empty array when no tokens", async () => {
    const concepts = await extractTrendingConcepts(state);
    expect(concepts).toEqual([]);
  });

  it("should extract concepts from token names", async () => {
    state.recentTokens = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "PEPE", name: "Pepe Token" },
        volumeETH: "10",
      }),
      createMockPool({
        memecoin: { address: "0x2", symbol: "DOGE", name: "Doge Coin" },
        volumeETH: "5",
      }),
    ];

    const concepts = await extractTrendingConcepts(state);

    expect(concepts).toContain("pepe");
    expect(concepts).toContain("doge");
  });

  it("should weight concepts by volume", async () => {
    state.recentTokens = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "HIGH", name: "High Volume" },
        volumeETH: "100",
      }),
      createMockPool({
        memecoin: { address: "0x2", symbol: "LOW", name: "Low Volume" },
        volumeETH: "0.1",
      }),
    ];

    const concepts = await extractTrendingConcepts(state);

    // Higher volume concept should rank first
    const highIndex = concepts.indexOf("high");
    const lowIndex = concepts.indexOf("low");
    expect(highIndex).toBeLessThan(lowIndex);
  });

  it("should filter common words", async () => {
    state.recentTokens = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "TEST", name: "The New Coin Token" },
        volumeETH: "10",
      }),
    ];

    const concepts = await extractTrendingConcepts(state);

    expect(concepts).not.toContain("the");
    expect(concepts).not.toContain("new");
    expect(concepts).not.toContain("coin");
    expect(concepts).not.toContain("token");
  });

  it("should include symbols with higher weight", async () => {
    state.recentTokens = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "BRETT", name: "Some Random Name" },
        volumeETH: "10",
      }),
    ];

    const concepts = await extractTrendingConcepts(state);

    expect(concepts).toContain("brett");
  });

  it("should update state with extracted concepts", async () => {
    state.recentTokens = [
      createMockPool({
        memecoin: { address: "0x1", symbol: "MOON", name: "Moon Shot" },
        volumeETH: "10",
      }),
    ];

    await extractTrendingConcepts(state);

    expect(state.trendingConcepts.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VOLUME VELOCITY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateVolumeVelocity", () => {
  it("should calculate velocity as volume / age in hours", () => {
    const pool = createMockPool({
      volumeETH: "10",
      createdAt: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    });

    const velocity = calculateVolumeVelocity(pool);

    // 10 ETH / 2 hours = 5 ETH/hour
    expect(velocity).toBeCloseTo(5, 1);
  });

  it("should boost very new tokens", () => {
    const pool = createMockPool({
      volumeETH: "1",
      createdAt: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
    });

    const velocity = calculateVolumeVelocity(pool);

    // Very new tokens get multiplied by 10
    expect(velocity).toBeGreaterThan(5);
  });

  it("should handle zero volume", () => {
    const pool = createMockPool({
      volumeETH: "0",
      createdAt: Math.floor(Date.now() / 1000) - 3600,
    });

    const velocity = calculateVolumeVelocity(pool);

    expect(velocity).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POOL FILTERING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("filterViablePools", () => {
  it("should filter pools below minimum volume", () => {
    const pools = [
      createMockPool({ volumeETH: "0.5" }), // Above min
      createMockPool({ volumeETH: "0.05" }), // Below min
    ];

    const filtered = filterViablePools(pools, 0.1);

    expect(filtered.length).toBe(1);
    expect(parseFloat(filtered[0].volumeETH)).toBeGreaterThanOrEqual(0.1);
  });

  it("should filter pools older than max age", () => {
    const pools = [
      createMockPool({
        volumeETH: "1",
        createdAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      }),
      createMockPool({
        volumeETH: "1",
        createdAt: Math.floor(Date.now() / 1000) - 200000, // ~55 hours ago
      }),
    ];

    const filtered = filterViablePools(pools, 0.1, 48);

    expect(filtered.length).toBe(1);
  });

  it("should return empty array when no pools meet criteria", () => {
    const pools = [
      createMockPool({ volumeETH: "0.01" }), // Below min
    ];

    const filtered = filterViablePools(pools, 0.1);

    expect(filtered).toEqual([]);
  });

  it("should use default values when not specified", () => {
    const pools = [
      createMockPool({ volumeETH: "0.5" }),
    ];

    const filtered = filterViablePools(pools);

    expect(filtered.length).toBe(1);
  });
});
