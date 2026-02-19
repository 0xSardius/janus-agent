/**
 * Runner Integration Tests
 *
 * Tests the orchestration logic of the main agent loop by composing
 * real context functions with mocked network boundaries.
 *
 * These tests simulate what runner.ts main() does:
 *   monitor → analyze → decide → create → launch → buy → monitor positions
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEther, erc20Abi } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS — network boundaries only
// ═══════════════════════════════════════════════════════════════════════════

// Mock Flaunch SDK (all chain transactions go through this)
vi.mock("@flaunch/sdk", () => ({
  createFlaunch: vi.fn(),
}));

// Mock LLM (concept generation)
vi.mock("./ai/llm.js", () => ({
  generateTokenConcept: vi.fn().mockResolvedValue({
    name: "Giga Pepe",
    symbol: "GPEPE",
    description: "The giga evolution of Pepe",
    imagePrompt: "A giant green frog",
    reasoning: "Pepe variations are evergreen",
  }),
  analyzeConceptPotential: vi.fn().mockResolvedValue({
    viralPotential: 0.8,
    timingScore: 0.7,
    saturationRisk: 0.3,
    overallScore: 0.75,
    recommendation: "launch",
    reasoning: "Good timing",
  }),
  extractConceptsFromTokens: vi.fn().mockResolvedValue({
    concepts: [],
    emergingThemes: [],
  }),
}));

// Mock image generation
vi.mock("./ai/image.js", () => ({
  generateTokenLogo: vi.fn().mockResolvedValue({
    url: "https://fal.ai/output/test.png",
    width: 512,
    height: 512,
    contentType: "image/png",
  }),
  imageUrlToBase64: vi.fn().mockResolvedValue("data:image/png;base64,testimage"),
}));

// Mock subgraph fetch (used by monitor and position-manager)
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Set env var needed by monitor and position-manager subgraph calls
process.env.FLAUNCH_SUBGRAPH_URL = "https://mock-subgraph.test/graphql";

import { createFlaunch as createFlaunchSDK } from "@flaunch/sdk";
import {
  createMonitorState,
  createAnalyzerState,
  createCreatorState,
  createLauncherState,
  createPositionManagerState,
  pollNewTokens,
  extractTrendingConcepts,
  scoreConcepts,
  selectLaunchCandidate,
  generateTokenConcept,
  launchToken,
  canLaunch,
  buyOwnToken,
  monitorPositions,
  getPortfolioStatus,
} from "./contexts/index.js";
import { makeDecision, getMarketConditions } from "./decision/engine.js";
import { checkSafetyConditions } from "./safety.js";
import { SAFETY_LIMITS, USDC_ADDRESS } from "./constants.js";
import { GasTracker } from "./utils/gas-tracker.js";
import { createPerformanceState, recordPositionPerformance } from "./performance/index.js";
import type { AgentState, MarketConditions } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockFlaunchSdk() {
  return {
    flaunchIPFS: vi.fn().mockResolvedValue("0xlaunchhash123" as `0x${string}`),
    getPoolCreatedFromTx: vi.fn().mockResolvedValue({
      memecoin: "0xNewToken0000000000000000000000000000001" as `0x${string}`,
      tokenId: BigInt(99),
      poolId: "pool-99",
    }),
    buyCoin: vi.fn().mockResolvedValue("0xbuyhash456" as `0x${string}`),
    sellCoin: vi.fn().mockResolvedValue("0xsellhash789" as `0x${string}`),
    withdrawCreatorRevenue: vi.fn().mockResolvedValue("0xclaimhash" as `0x${string}`),
  };
}

const AGENT_WALLET = "0xAgentWallet00000000000000000000000000001" as `0x${string}`;

function createMockPublicClient(ethBalance: bigint = parseEther("0.5")) {
  return {
    getBalance: vi.fn().mockResolvedValue(ethBalance),
    getGasPrice: vi.fn().mockResolvedValue(BigInt(30) * BigInt(1e9)), // 30 gwei
    getChainId: vi.fn().mockResolvedValue(8453),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      gasUsed: BigInt(200000),
      effectiveGasPrice: BigInt(30) * BigInt(1e9),
      logs: [
        {
          // Mock ERC-20 Transfer event: tokens sent to wallet
          address: "0xNewToken0000000000000000000000000000001",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
            "0x0000000000000000000000000000000000000000000000000000000000000000", // from (zero = mint-like)
            `0x000000000000000000000000${AGENT_WALLET.slice(2).toLowerCase()}`, // to
          ],
          data: "0x00000000000000000000000000000000000000000000003635c9adc5dea00000", // 1000 tokens
        },
      ],
    }),
    readContract: vi.fn().mockResolvedValue(BigInt(50) * BigInt(1e6)), // 50 USDC
    getTransactionReceipt: vi.fn().mockResolvedValue({
      gasUsed: BigInt(200000),
      effectiveGasPrice: BigInt(30) * BigInt(1e9),
    }),
  } as any;
}

function createMockWalletClient() {
  return {} as any;
}

function createMockWalletProvider(ethBalance: bigint = parseEther("0.5")) {
  return {
    getBalance: vi.fn().mockResolvedValue(ethBalance.toString()),
    getAddress: vi.fn().mockResolvedValue(AGENT_WALLET),
  } as any;
}

function setupSubgraphMock(tokens: any[] = []) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          pools: tokens,
        },
      }),
  });
}

/** Replicates runner.ts getAgentState() */
function getAgentState(
  contexts: {
    launcher: ReturnType<typeof createLauncherState>;
    analyzer: ReturnType<typeof createAnalyzerState>;
    positionManager: ReturnType<typeof createPositionManagerState>;
  },
  ethBalance: bigint,
  usdcBalance: bigint,
  consecutiveFailures: number,
  gasTracker: GasTracker
): AgentState {
  return {
    ethBalance,
    usdcBalance,
    launchedTokens: contexts.launcher.launchedTokens,
    scoredConcepts: contexts.analyzer.scoredConcepts,
    lastLaunchTimestamp: contexts.launcher.lastLaunchTimestamp,
    consecutiveFailures,
    dailyGasSpent: gasTracker.getTodayGasSpent(),
    todayLaunchCount: contexts.launcher.dailyLaunchCount,
  };
}

/** Replicates runner.ts readUSDCBalance() */
async function readUSDCBalance(publicClient: any, walletAddress: `0x${string}`): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });
    return balance as bigint;
  } catch {
    return BigInt(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// readUSDCBalance
// ═══════════════════════════════════════════════════════════════════════════

describe("readUSDCBalance", () => {
  it("should read USDC balance from contract", async () => {
    const publicClient = createMockPublicClient();

    const balance = await readUSDCBalance(publicClient, AGENT_WALLET);

    expect(balance).toBe(BigInt(50) * BigInt(1e6));
    expect(publicClient.readContract).toHaveBeenCalledWith({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [AGENT_WALLET],
    });
  });

  it("should return 0 when readContract fails", async () => {
    const publicClient = createMockPublicClient();
    publicClient.readContract.mockRejectedValue(new Error("contract not found"));

    const balance = await readUSDCBalance(publicClient, AGENT_WALLET);

    expect(balance).toBe(BigInt(0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAgentState ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════

describe("getAgentState assembly", () => {
  it("should compose state from all contexts correctly", () => {
    const launcher = createLauncherState();
    const analyzer = createAnalyzerState();
    const positionManager = createPositionManagerState();
    const gasTracker = new GasTracker();

    // Set up some state
    launcher.lastLaunchTimestamp = 1000;
    launcher.dailyLaunchCount = 2;
    analyzer.scoredConcepts = [{ concept: "test", score: 0.8 }];
    gasTracker.recordGasUsed("0x1", parseEther("0.01"));

    const state = getAgentState(
      { launcher, analyzer, positionManager },
      parseEther("0.5"),
      BigInt(50e6),
      1,
      gasTracker
    );

    expect(state.ethBalance).toBe(parseEther("0.5"));
    expect(state.usdcBalance).toBe(BigInt(50e6));
    expect(state.lastLaunchTimestamp).toBe(1000);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.todayLaunchCount).toBe(2);
    expect(state.scoredConcepts).toHaveLength(1);
    expect(state.dailyGasSpent).toBe(parseEther("0.01"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL CYCLE — HAPPY PATH
// ═══════════════════════════════════════════════════════════════════════════

describe("Full launch cycle orchestration", () => {
  let mockSdk: ReturnType<typeof createMockFlaunchSdk>;
  let publicClient: ReturnType<typeof createMockPublicClient>;
  let walletClient: ReturnType<typeof createMockWalletClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSdk = createMockFlaunchSdk();
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
    publicClient = createMockPublicClient();
    walletClient = createMockWalletClient();

    // Default subgraph response (SubgraphPool format)
    setupSubgraphMock([
      {
        id: "pool-1",
        collectionToken: { id: "0x111", name: "Doge", symbol: "DOGE", createdAt: String(Math.floor(Date.now() / 1000) - 3600), volumeETH: "5000000000000000000", totalFeesETH: "50000000000000000", fairLaunch: null },
        volumeETH: "5000000000000000000",
        volumeUSDC: "15000",
        totalFeesETH: "50000000000000000",
        feeAllocation: { creator: 7000, community: 3000 },
        liveAtTimestamp: String(Math.floor(Date.now() / 1000) - 3600),
      },
      {
        id: "pool-2",
        collectionToken: { id: "0x222", name: "Pepe", symbol: "PEPE", createdAt: String(Math.floor(Date.now() / 1000) - 1800), volumeETH: "3000000000000000000", totalFeesETH: "30000000000000000", fairLaunch: null },
        volumeETH: "3000000000000000000",
        volumeUSDC: "9000",
        totalFeesETH: "30000000000000000",
        feeAllocation: { creator: 7000, community: 3000 },
        liveAtTimestamp: String(Math.floor(Date.now() / 1000) - 1800),
      },
    ]);
  });

  it("should execute full cycle: monitor → analyze → decide → create → launch → buy", async () => {
    const monitor = createMonitorState();
    const analyzer = createAnalyzerState();
    const creator = createCreatorState();
    const launcher = createLauncherState();
    const positionManager = createPositionManagerState();

    // 1. Monitor: Poll for new tokens
    const pollResult = await pollNewTokens(monitor);
    expect(pollResult.tokensFound).toBeGreaterThanOrEqual(0);

    // 2. Analyze: Extract concepts
    const concepts = await extractTrendingConcepts(monitor);

    // 3. Score concepts
    if (concepts.length > 0) {
      await scoreConcepts(analyzer, concepts, monitor.recentTokens);
    }

    // Set up a high-scoring concept to trigger launch
    analyzer.scoredConcepts = [
      { concept: "pepe", score: 0.85, factors: { volumeScore: 0.8, recencyScore: 0.9, socialScore: 0.7, noveltyScore: 0.8 } },
    ];

    // 4. Decision: Should we launch?
    const gasTracker = new GasTracker();
    const agentState = getAgentState(
      { launcher, analyzer, positionManager },
      parseEther("0.5"),
      BigInt(50e6),
      0,
      gasTracker
    );

    const marketConditions: MarketConditions = {
      hourlyVolume: parseEther("15"),
      recentLaunches: 5,
      gasPrice: BigInt(30e9),
      timestamp: Date.now(),
    };

    const decision = await makeDecision(agentState, marketConditions);
    expect(decision.shouldLaunch).toBe(true);
    expect(decision.suggestedConcept).toBe("pepe");

    // 5. canLaunch check
    expect(canLaunch(launcher).canLaunch).toBe(true);

    // 6. Generate token metadata
    const metadata = await generateTokenConcept(creator, {
      baseConcept: "pepe",
      iterationType: "derivative",
      style: "meme",
    });
    expect(metadata.name).toBe("Giga Pepe");

    // 7. Launch token
    const launchResult = await launchToken(
      launcher,
      {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        base64Image: metadata.base64Image,
      },
      publicClient,
      walletClient,
      AGENT_WALLET
    );

    expect(launchResult.success).toBe(true);
    expect(launchResult.tokenAddress).toBeDefined();
    expect(launcher.launchedTokens).toHaveLength(1);
    expect(launcher.dailyLaunchCount).toBe(1);

    // 8. Buy own token
    const buyResult = await buyOwnToken(
      positionManager,
      launchResult.tokenAddress!,
      metadata.symbol,
      publicClient,
      walletClient,
      AGENT_WALLET
    );

    expect(buyResult.success).toBe(true);
    expect(positionManager.activePositions).toHaveLength(1);
    expect(positionManager.activePositions[0].tokenSymbol).toBe("GPEPE");
  });

  it("should track consecutive failures on launch error", async () => {
    mockSdk.flaunchIPFS.mockRejectedValue(new Error("execution reverted"));
    const launcher = createLauncherState();
    let consecutiveFailures = 0;

    const result = await launchToken(
      launcher,
      { name: "Fail Token", symbol: "FAIL", description: "Will fail" },
      publicClient,
      walletClient,
      AGENT_WALLET
    );

    expect(result.success).toBe(false);

    // Runner increments consecutiveFailures on failure
    consecutiveFailures++;
    expect(consecutiveFailures).toBe(1);

    // State should NOT have the failed token
    expect(launcher.launchedTokens).toHaveLength(0);
  });

  it("should reset consecutive failures on successful launch", async () => {
    let consecutiveFailures = 2; // Was at 2

    const launcher = createLauncherState();
    const result = await launchToken(
      launcher,
      { name: "Success Token", symbol: "WIN", description: "Will succeed" },
      publicClient,
      walletClient,
      AGENT_WALLET
    );

    expect(result.success).toBe(true);
    // Runner resets on success
    if (result.success) {
      consecutiveFailures = 0;
    }
    expect(consecutiveFailures).toBe(0);
  });

  it("should handle launch success but buy failure gracefully", async () => {
    const launcher = createLauncherState();
    const positionManager = createPositionManagerState();

    // Launch succeeds
    const launchResult = await launchToken(
      launcher,
      { name: "Token", symbol: "TKN", description: "Test" },
      publicClient,
      walletClient,
      AGENT_WALLET
    );
    expect(launchResult.success).toBe(true);
    expect(launcher.launchedTokens).toHaveLength(1);

    // Buy fails (e.g., slippage)
    mockSdk.buyCoin.mockRejectedValue(new Error("slippage exceeded"));

    const buyResult = await buyOwnToken(
      positionManager,
      launchResult.tokenAddress!,
      "TKN",
      publicClient,
      walletClient,
      AGENT_WALLET
    );

    expect(buyResult.success).toBe(false);
    expect(buyResult.reason).toMatch(/slippage exceeded/);

    // Token is still tracked in launcher (launch DID succeed)
    expect(launcher.launchedTokens).toHaveLength(1);
    // But no position was opened
    expect(positionManager.activePositions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY CHECK INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Safety check integration", () => {
  it("should block cycle when consecutive failures hit limit", async () => {
    const walletProvider = createMockWalletProvider();
    const publicClient = createMockPublicClient();

    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [],
      lastLaunchTimestamp: 0,
      consecutiveFailures: SAFETY_LIMITS.maxConsecutiveFailures, // At the limit
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const result = await checkSafetyConditions(walletProvider, publicClient, agentState);

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/consecutive failures/i);
  });

  it("should block cycle when ETH balance is too low", async () => {
    const walletProvider = createMockWalletProvider(parseEther("0.003"));
    const publicClient = createMockPublicClient(parseEther("0.003"));

    const agentState: AgentState = {
      ethBalance: parseEther("0.003"), // Below 0.005 minimum
      usdcBalance: BigInt(0),
      launchedTokens: [],
      scoredConcepts: [],
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const result = await checkSafetyConditions(walletProvider, publicClient, agentState);

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/ETH balance too low/i);
  });

  it("should block when daily gas spend exceeded", async () => {
    const walletProvider = createMockWalletProvider();
    const publicClient = createMockPublicClient();

    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [],
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: SAFETY_LIMITS.maxDailyGasSpend + BigInt(1),
      todayLaunchCount: 0,
    };

    const result = await checkSafetyConditions(walletProvider, publicClient, agentState);

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/gas limit/i);
  });

  it("should block when gas price is too high", async () => {
    const walletProvider = createMockWalletProvider();
    const publicClient = createMockPublicClient();
    // 200 gwei — above 100 gwei limit
    publicClient.getGasPrice.mockResolvedValue(BigInt(200) * BigInt(1e9));

    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [],
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const result = await checkSafetyConditions(walletProvider, publicClient, agentState);

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/Gas price too high/i);
  });

  it("should pass when all conditions are normal", async () => {
    const walletProvider = createMockWalletProvider();
    const publicClient = createMockPublicClient();

    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [],
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const result = await checkSafetyConditions(walletProvider, publicClient, agentState);

    expect(result.safe).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DAILY RESET LOGIC
// ═══════════════════════════════════════════════════════════════════════════

describe("Daily reset logic", () => {
  it("should reset gas tracker and launch count on new day", () => {
    const gasTracker = new GasTracker();
    const launcher = createLauncherState();

    // Simulate yesterday's activity by loading records with yesterday's timestamp
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    gasTracker.loadRecords([
      { txHash: "0x1", gasUsed: parseEther("0.1"), timestamp: yesterday },
    ]);
    launcher.dailyLaunchCount = 3;

    // Yesterday's gas should show up initially via getTodayGasSpent
    // (only if within today's UTC window — they won't since they're yesterday)
    // resetDaily prunes old records
    gasTracker.resetDaily();
    launcher.dailyLaunchCount = 0;

    expect(gasTracker.getTodayGasSpent()).toBe(BigInt(0));
    expect(launcher.dailyLaunchCount).toBe(0);
  });

  it("should track gas across multiple transactions within a day", () => {
    const gasTracker = new GasTracker();

    gasTracker.recordGasUsed("0x1", parseEther("0.01"));
    gasTracker.recordGasUsed("0x2", parseEther("0.005"));
    gasTracker.recordGasUsed("0x3", parseEther("0.002"));

    expect(gasTracker.getTodayGasSpent()).toBe(parseEther("0.017"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSITION EXIT → PERFORMANCE RECORDING
// ═══════════════════════════════════════════════════════════════════════════

describe("Position exit performance recording", () => {
  it("should record performance when a position is closed", () => {
    const analyzer = createAnalyzerState();
    const performanceState = createPerformanceState();

    // Set up scored concept
    analyzer.scoredConcepts = [
      {
        concept: "pepe",
        score: 0.8,
        factors: { volumeScore: 0.8, recencyScore: 0.9, socialScore: 0.7, noveltyScore: 0.8 },
      },
    ];

    // Simulate an exited position
    const exitedPosition = {
      tokenAddress: "0x1234",
      tokenSymbol: "GPEPE",
      entryPriceETH: BigInt(1000),
      amountToken: parseEther("1000"),
      costBasisETH: parseEther("0.0025"),
      boughtAt: Date.now() - 86400000,
      tranchesSold: 100,
      totalSoldETH: parseEther("0.0075"),
      status: "exited" as const,
      concept: "pepe",
    };

    const exitResult = {
      token: "GPEPE",
      action: "TAKE_PROFIT_3x",
      multiple: "3.00",
      ethReceived: "0.0075",
    };

    const factorScores = analyzer.scoredConcepts.find(
      (c) => c.concept === "pepe"
    )?.factors;

    recordPositionPerformance(
      performanceState,
      analyzer,
      "pepe",
      exitedPosition,
      exitResult,
      factorScores
    );

    expect(performanceState.results).toHaveLength(1);
    expect(performanceState.results[0].concept).toBe("pepe");
    expect(performanceState.results[0].profitMultiple).toBeCloseTo(3.0, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO STATUS
// ═══════════════════════════════════════════════════════════════════════════

describe("Portfolio status after operations", () => {
  it("should correctly report after buy", async () => {
    setupSubgraphMock([]);
    const positionManager = createPositionManagerState();

    // Manually add a position (simulating successful buy)
    positionManager.activePositions.push({
      tokenAddress: "0x1234",
      tokenSymbol: "TEST",
      entryPriceETH: BigInt(1000),
      amountToken: parseEther("500"),
      costBasisETH: parseEther("0.0025"),
      boughtAt: Date.now(),
      tranchesSold: 0,
      totalSoldETH: BigInt(0),
      status: "active",
    });
    positionManager.totalInvested = parseEther("0.0025");

    // Portfolio status reads price from subgraph — set up mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          pools: [{ sqrtPriceX96: "79228162514264337593543950336" }], // price = 1
        },
      }),
    });

    const portfolio = await getPortfolioStatus(positionManager);

    expect(portfolio.activePositions).toBe(1);
    expect(portfolio.closedPositions).toBe(0);
    expect(portfolio.totalInvestedETH).toBe("0.0025");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DECISION ENGINE — BLOCKS LAUNCH CORRECTLY
// ═══════════════════════════════════════════════════════════════════════════

describe("Decision engine integration", () => {
  it("should not suggest launch when no concepts are scored", async () => {
    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [], // No concepts
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const market: MarketConditions = {
      hourlyVolume: parseEther("15"),
      recentLaunches: 5,
      gasPrice: BigInt(30e9),
      timestamp: Date.now(),
    };

    const decision = await makeDecision(agentState, market);

    expect(decision.suggestedConcept).toBeUndefined();
  });

  it("should not suggest launch when top concept score is below threshold", async () => {
    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [{ concept: "weak", score: 0.3 }], // Below 0.65
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const market: MarketConditions = {
      hourlyVolume: parseEther("15"),
      recentLaunches: 5,
      gasPrice: BigInt(30e9),
      timestamp: Date.now(),
    };

    const decision = await makeDecision(agentState, market);

    expect(decision.suggestedConcept).toBeUndefined();
  });

  it("should not launch when gas balance is insufficient", async () => {
    const agentState: AgentState = {
      ethBalance: parseEther("0.003"), // Below 0.005 minimum
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [{ concept: "pepe", score: 0.9 }],
      lastLaunchTimestamp: 0,
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const market: MarketConditions = {
      hourlyVolume: parseEther("15"),
      recentLaunches: 5,
      gasPrice: BigInt(30e9),
      timestamp: Date.now(),
    };

    const decision = await makeDecision(agentState, market);

    expect(decision.shouldLaunch).toBe(false);
  });

  it("should not launch during cooldown period", async () => {
    const agentState: AgentState = {
      ethBalance: parseEther("0.5"),
      usdcBalance: BigInt(50e6),
      launchedTokens: [],
      scoredConcepts: [{ concept: "pepe", score: 0.9 }],
      lastLaunchTimestamp: Date.now() - 30 * 60 * 1000, // 30 min ago (need 2h)
      consecutiveFailures: 0,
      dailyGasSpent: BigInt(0),
      todayLaunchCount: 0,
    };

    const market: MarketConditions = {
      hourlyVolume: parseEther("15"),
      recentLaunches: 5,
      gasPrice: BigInt(30e9),
      timestamp: Date.now(),
    };

    const decision = await makeDecision(agentState, market);

    expect(decision.shouldLaunch).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSITION MANAGER — BUY SAFETY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

describe("Position manager buy safety guards", () => {
  let mockSdk: ReturnType<typeof createMockFlaunchSdk>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSdk = createMockFlaunchSdk();
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
  });

  it("should reject buy when max positions reached", async () => {
    const positionManager = createPositionManagerState();
    const publicClient = createMockPublicClient();

    // Fill up positions
    for (let i = 0; i < 5; i++) {
      positionManager.activePositions.push({
        tokenAddress: `0x${i.toString().padStart(40, "0")}`,
        tokenSymbol: `T${i}`,
        entryPriceETH: BigInt(1000),
        amountToken: parseEther("100"),
        costBasisETH: parseEther("0.0025"),
        boughtAt: Date.now(),
        tranchesSold: 0,
        totalSoldETH: BigInt(0),
        status: "active",
      });
    }

    const result = await buyOwnToken(
      positionManager,
      "0xNewToken" as `0x${string}`,
      "NEW",
      publicClient,
      createMockWalletClient(),
      AGENT_WALLET
    );

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/Max active positions/i);
  });

  it("should reject buy when portfolio exposure limit exceeded", async () => {
    const positionManager = createPositionManagerState();
    // Small wallet balance means 25% exposure limit is quickly reached
    const publicClient = createMockPublicClient(parseEther("0.01"));

    // Already at exposure limit
    positionManager.activePositions.push({
      tokenAddress: "0x1",
      tokenSymbol: "T1",
      entryPriceETH: BigInt(1000),
      amountToken: parseEther("100"),
      costBasisETH: parseEther("0.004"), // 0.004 of 0.01 wallet = 40% > 25% limit
      boughtAt: Date.now(),
      tranchesSold: 0,
      totalSoldETH: BigInt(0),
      status: "active",
    });

    const result = await buyOwnToken(
      positionManager,
      "0xNewToken" as `0x${string}`,
      "NEW",
      publicClient,
      createMockWalletClient(),
      AGENT_WALLET
    );

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/exposure limit/i);
  });
});
