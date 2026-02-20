import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEther } from "viem";
import {
  createLauncherState,
  launchToken,
  canLaunch,
  claimRevenue,
  claimAllRevenue,
  getLaunchedTokens,
  resetDailyCounters,
  type LauncherState,
  type LaunchConfig,
} from "./launcher.js";
import { SAFETY_LIMITS } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FLAUNCH SDK
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("@flaunch/sdk", () => ({
  createFlaunch: vi.fn(),
}));

import { createFlaunch as createFlaunchSDK } from "@flaunch/sdk";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockPublicClient(balanceETH: string = "0.5") {
  return {
    getBalance: vi.fn().mockResolvedValue(parseEther(balanceETH)),
  } as any;
}

function createMockWalletClient() {
  return {} as any;
}

const MOCK_WALLET = "0xaBcDeF0123456789AbCdEf0123456789aBcDeF01" as `0x${string}`;

function createMockFlaunchSdk() {
  return {
    flaunchIPFS: vi.fn().mockResolvedValue("0xlaunchhash"),
    getPoolCreatedFromTx: vi.fn().mockResolvedValue({
      memecoin: "0xtoken1234567890abcdef1234567890abcdef1234" as `0x${string}`,
      tokenId: BigInt(42),
      poolId: "pool-42",
    }),
    buyCoin: vi.fn().mockResolvedValue("0xbuyhash"),
    sellCoin: vi.fn().mockResolvedValue("0xsellhash"),
    withdrawCreatorRevenue: vi.fn().mockResolvedValue("0xclaimhash"),
  };
}

function makeConfig(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  return {
    name: "Test Token",
    symbol: "TEST",
    description: "A test token",
    base64Image: "data:image/png;base64,abc123",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION
// ═══════════════════════════════════════════════════════════════════════════

describe("createLauncherState", () => {
  it("should create initial state with empty values", () => {
    const state = createLauncherState();

    expect(state.launchedTokens).toEqual([]);
    expect(state.totalRevenue).toBe(BigInt(0));
    expect(state.pendingClaims).toEqual([]);
    expect(state.lastLaunchTimestamp).toBe(0);
    expect(state.dailyLaunchCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// canLaunch CHECKS
// ═══════════════════════════════════════════════════════════════════════════

describe("canLaunch", () => {
  let state: LauncherState;

  beforeEach(() => {
    state = createLauncherState();
  });

  it("should allow launch when no prior launches", () => {
    const result = canLaunch(state);
    expect(result.canLaunch).toBe(true);
  });

  it("should block launch during cooldown period", () => {
    // Last launch was 30 minutes ago — need 2 hours
    state.lastLaunchTimestamp = Date.now() - 30 * 60 * 1000;

    const result = canLaunch(state);
    expect(result.canLaunch).toBe(false);
    expect(result.reason).toMatch(/Cooldown/i);
  });

  it("should allow launch after cooldown expires", () => {
    // Last launch was 3 hours ago — cooldown is 2 hours
    state.lastLaunchTimestamp = Date.now() - 3 * 60 * 60 * 1000;

    const result = canLaunch(state);
    expect(result.canLaunch).toBe(true);
  });

  it("should block launch when daily limit is reached", () => {
    // Add max launches for today
    const now = Date.now();
    for (let i = 0; i < SAFETY_LIMITS.maxLaunchesPerDay; i++) {
      state.launchedTokens.push({
        address: `0x${i.toString().padStart(40, "0")}`,
        tokenId: BigInt(i),
        name: `Token ${i}`,
        symbol: `T${i}`,
        launchedAt: now - i * 1000, // All launched today
        txHash: `0x${i.toString(16).padStart(64, "0")}`,
      });
    }
    // Ensure cooldown has passed
    state.lastLaunchTimestamp = Date.now() - 3 * 60 * 60 * 1000;

    const result = canLaunch(state);
    expect(result.canLaunch).toBe(false);
    expect(result.reason).toMatch(/Daily limit/i);
  });

  it("should not count yesterday's launches against today's limit", () => {
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    for (let i = 0; i < SAFETY_LIMITS.maxLaunchesPerDay; i++) {
      state.launchedTokens.push({
        address: `0x${i.toString().padStart(40, "0")}`,
        tokenId: BigInt(i),
        name: `Token ${i}`,
        symbol: `T${i}`,
        launchedAt: yesterday,
        txHash: `0x${i.toString(16).padStart(64, "0")}`,
      });
    }

    const result = canLaunch(state);
    expect(result.canLaunch).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// launchToken — SAFETY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

describe("launchToken", () => {
  let state: LauncherState;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let mockWalletClient: ReturnType<typeof createMockWalletClient>;
  let mockSdk: ReturnType<typeof createMockFlaunchSdk>;

  beforeEach(() => {
    state = createLauncherState();
    mockPublicClient = createMockPublicClient("0.5");
    mockWalletClient = createMockWalletClient();
    mockSdk = createMockFlaunchSdk();
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
  });

  it("should reject when cooldown is active", async () => {
    state.lastLaunchTimestamp = Date.now() - 30 * 60 * 1000; // 30 min ago

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cooldown/i);
    expect(mockSdk.flaunchIPFS).not.toHaveBeenCalled();
  });

  it("should reject when daily limit is reached", async () => {
    const now = Date.now();
    for (let i = 0; i < SAFETY_LIMITS.maxLaunchesPerDay; i++) {
      state.launchedTokens.push({
        address: `0x${i.toString().padStart(40, "0")}`,
        tokenId: BigInt(i),
        name: `Token ${i}`,
        symbol: `T${i}`,
        launchedAt: now - i * 1000,
        txHash: `0x${i.toString(16).padStart(64, "0")}`,
      });
    }

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Daily launch limit/i);
  });

  it("should reject when ETH balance is below minimum", async () => {
    mockPublicClient = createMockPublicClient("0.003"); // Below 0.005 minimum

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient ETH/i);
  });

  // ─── SUCCESS PATH ──────────────────────────────────────────────────────

  it("should launch successfully and update state", async () => {
    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xlaunchhash");
    expect(result.tokenAddress).toBe("0xtoken1234567890abcdef1234567890abcdef1234");
    expect(result.tokenId).toBe(BigInt(42));
    expect(result.poolId).toBe("pool-42");
  });

  it("should record launched token in state after success", async () => {
    await launchToken(state, makeConfig({ name: "Doge Moon", symbol: "DMOON" }), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(state.launchedTokens).toHaveLength(1);
    expect(state.launchedTokens[0].name).toBe("Doge Moon");
    expect(state.launchedTokens[0].symbol).toBe("DMOON");
    expect(state.launchedTokens[0].txHash).toBe("0xlaunchhash");
  });

  it("should update lastLaunchTimestamp and dailyLaunchCount on success", async () => {
    const before = Date.now();
    await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(state.lastLaunchTimestamp).toBeGreaterThanOrEqual(before);
    expect(state.dailyLaunchCount).toBe(1);
  });

  it("should pass correct params to Flaunch SDK", async () => {
    const config = makeConfig({
      name: "Super Pepe",
      symbol: "SPEPE",
      description: "The super evolution",
      base64Image: "data:image/png;base64,xyz",
      initialMarketCapUSD: 15_000,
      fairLaunchDuration: 60 * 60,
      creatorFeePercent: 80,
    });

    await launchToken(state, config, mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(mockSdk.flaunchIPFS).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Super Pepe",
        symbol: "SPEPE", // Should be sliced to 6 chars
        fairLaunchPercent: 0,
        fairLaunchDuration: 3600,
        initialMarketCapUSD: 15_000,
        creator: MOCK_WALLET,
        creatorFeeAllocationPercent: 80,
        metadata: {
          base64Image: "data:image/png;base64,xyz",
          description: "The super evolution",
        },
      })
    );
  });

  it("should truncate symbol to 6 characters", async () => {
    const config = makeConfig({ symbol: "LONGERSYMBOL" });

    await launchToken(state, config, mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(mockSdk.flaunchIPFS).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LONGER" })
    );
  });

  it("should use default values for optional config fields", async () => {
    const config = makeConfig();
    delete (config as any).initialMarketCapUSD;
    delete (config as any).fairLaunchDuration;
    delete (config as any).creatorFeePercent;

    await launchToken(state, config, mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(mockSdk.flaunchIPFS).toHaveBeenCalledWith(
      expect.objectContaining({
        fairLaunchDuration: 0, // Skip fair launch, straight to AMM
        initialMarketCapUSD: 10_000,
        creatorFeeAllocationPercent: 100,
      })
    );
  });

  // ─── EDGE CASES ────────────────────────────────────────────────────────

  it("should handle tx success but no pool data (missing event)", async () => {
    mockSdk.getPoolCreatedFromTx.mockResolvedValue(null);

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xlaunchhash");
    expect(result.tokenAddress).toBeUndefined();
    expect(result.error).toMatch(/could not parse pool creation/i);
  });

  it("should handle Flaunch SDK error gracefully", async () => {
    mockSdk.flaunchIPFS.mockRejectedValue(new Error("execution reverted: insufficient gas"));

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient gas/i);
    // State should NOT be updated on failure
    expect(state.launchedTokens).toHaveLength(0);
    expect(state.dailyLaunchCount).toBe(0);
  });

  it("should handle non-Error throws from SDK", async () => {
    mockSdk.flaunchIPFS.mockRejectedValue("raw string error");

    const result = await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    expect(result.success).toBe(false);
    expect(result.error).toBe("raw string error");
  });

  it("should not update state when pool data parse fails", async () => {
    mockSdk.getPoolCreatedFromTx.mockResolvedValue(null);

    await launchToken(state, makeConfig(), mockPublicClient, mockWalletClient, MOCK_WALLET);

    // Token should NOT be added to launchedTokens when pool data is missing
    // (txHash returned but no token address)
    expect(state.launchedTokens).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FEE CLAIMS
// ═══════════════════════════════════════════════════════════════════════════

describe("claimRevenue", () => {
  let mockSdk: ReturnType<typeof createMockFlaunchSdk>;

  beforeEach(() => {
    mockSdk = createMockFlaunchSdk();
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
  });

  it("should claim revenue successfully", async () => {
    const state = createLauncherState();
    state.pendingClaims.push("42");

    const result = await claimRevenue(
      state,
      BigInt(42),
      createMockPublicClient(),
      createMockWalletClient()
    );

    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xclaimhash");
    expect(state.pendingClaims).not.toContain("42");
  });

  it("should handle claim failure", async () => {
    mockSdk.withdrawCreatorRevenue.mockRejectedValue(new Error("no revenue to claim"));

    const state = createLauncherState();
    const result = await claimRevenue(
      state,
      BigInt(42),
      createMockPublicClient(),
      createMockWalletClient()
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no revenue to claim/i);
  });
});

describe("claimAllRevenue", () => {
  let mockSdk: ReturnType<typeof createMockFlaunchSdk>;

  beforeEach(() => {
    mockSdk = createMockFlaunchSdk();
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
  });

  it("should claim revenue for all launched tokens", async () => {
    const state = createLauncherState();
    state.launchedTokens.push(
      { address: "0x1", tokenId: BigInt(1), name: "T1", symbol: "T1", launchedAt: Date.now(), txHash: "0x1" },
      { address: "0x2", tokenId: BigInt(2), name: "T2", symbol: "T2", launchedAt: Date.now(), txHash: "0x2" }
    );

    const result = await claimAllRevenue(state, createMockPublicClient(), createMockWalletClient());

    expect(result.claimed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("should count failures separately", async () => {
    mockSdk.withdrawCreatorRevenue
      .mockResolvedValueOnce("0xhash1")
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("0xhash3");

    const state = createLauncherState();
    state.launchedTokens.push(
      { address: "0x1", tokenId: BigInt(1), name: "T1", symbol: "T1", launchedAt: Date.now(), txHash: "0x1" },
      { address: "0x2", tokenId: BigInt(2), name: "T2", symbol: "T2", launchedAt: Date.now(), txHash: "0x2" },
      { address: "0x3", tokenId: BigInt(3), name: "T3", symbol: "T3", launchedAt: Date.now(), txHash: "0x3" }
    );

    const result = await claimAllRevenue(state, createMockPublicClient(), createMockWalletClient());

    expect(result.claimed).toBe(2);
    expect(result.failed).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

describe("getLaunchedTokens", () => {
  it("should return a copy of launched tokens", () => {
    const state = createLauncherState();
    state.launchedTokens.push({
      address: "0x1",
      tokenId: BigInt(1),
      name: "Token",
      symbol: "TKN",
      launchedAt: Date.now(),
      txHash: "0xhash",
    });

    const tokens = getLaunchedTokens(state);
    expect(tokens).toHaveLength(1);

    // Should be a copy, not a reference
    tokens.push({} as any);
    expect(state.launchedTokens).toHaveLength(1);
  });
});

describe("resetDailyCounters", () => {
  it("should reset daily launch count to zero", () => {
    const state = createLauncherState();
    state.dailyLaunchCount = 3;

    resetDailyCounters(state);

    expect(state.dailyLaunchCount).toBe(0);
  });
});
