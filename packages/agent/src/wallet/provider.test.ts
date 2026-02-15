import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseEther } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK @coinbase/agentkit
// We must mock before importing provider.ts since it uses dynamic import
// ═══════════════════════════════════════════════════════════════════════════

const mockConfigureWithWallet = vi.fn();
const mockAgentKitFrom = vi.fn();

vi.mock("@coinbase/agentkit", () => ({
  CdpWalletProvider: {
    configureWithWallet: (...args: any[]) => mockConfigureWithWallet(...args),
  },
  AgentKit: {
    from: (...args: any[]) => mockAgentKitFrom(...args),
  },
}));

import {
  initializeAgentWallet,
  createViemClients,
  getWalletStatus,
  getWalletBalance,
  testWalletConnection,
} from "./provider.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockWalletProvider(overrides: Record<string, any> = {}): any {
  return {
    getAddress: vi.fn().mockResolvedValue("0xABCDef0123456789abcDEF0123456789ABCDef01"),
    getBalance: vi.fn().mockResolvedValue("500000000000000000"), // 0.5 ETH as string
    getWalletClient: vi.fn().mockReturnValue({ signTransaction: vi.fn() }),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// initializeAgentWallet
// ═══════════════════════════════════════════════════════════════════════════

describe("initializeAgentWallet", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockConfigureWithWallet.mockReset();
    mockAgentKitFrom.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw when CDP_API_KEY_NAME is missing", async () => {
    delete process.env.CDP_API_KEY_NAME;
    process.env.CDP_API_KEY_PRIVATE = "some-private-key";

    await expect(initializeAgentWallet()).rejects.toThrow(
      /CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE must be set/
    );
  });

  it("should throw when CDP_API_KEY_PRIVATE is missing", async () => {
    process.env.CDP_API_KEY_NAME = "some-key-name";
    delete process.env.CDP_API_KEY_PRIVATE;

    await expect(initializeAgentWallet()).rejects.toThrow(
      /CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE must be set/
    );
  });

  it("should throw when both CDP env vars are missing", async () => {
    delete process.env.CDP_API_KEY_NAME;
    delete process.env.CDP_API_KEY_PRIVATE;

    await expect(initializeAgentWallet()).rejects.toThrow(
      /CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE must be set/
    );
  });

  it("should initialize wallet provider with correct params", async () => {
    process.env.CDP_API_KEY_NAME = "test-key-name";
    process.env.CDP_API_KEY_PRIVATE = "test-private-key";

    const mockProvider = createMockWalletProvider();
    mockConfigureWithWallet.mockResolvedValue(mockProvider);
    mockAgentKitFrom.mockResolvedValue({ walletProvider: mockProvider });

    const result = await initializeAgentWallet();

    expect(mockConfigureWithWallet).toHaveBeenCalledWith({
      apiKeyName: "test-key-name",
      apiKeyPrivateKey: "test-private-key",
      networkId: "base-mainnet",
    });
    expect(result.walletProvider).toBe(mockProvider);
  });

  it("should initialize AgentKit with empty actionProviders", async () => {
    process.env.CDP_API_KEY_NAME = "test-key-name";
    process.env.CDP_API_KEY_PRIVATE = "test-private-key";

    const mockProvider = createMockWalletProvider();
    mockConfigureWithWallet.mockResolvedValue(mockProvider);
    mockAgentKitFrom.mockResolvedValue({ walletProvider: mockProvider });

    await initializeAgentWallet();

    expect(mockAgentKitFrom).toHaveBeenCalledWith({
      walletProvider: mockProvider,
      actionProviders: [],
    });
  });

  it("should propagate CDP configuration errors", async () => {
    process.env.CDP_API_KEY_NAME = "bad-key";
    process.env.CDP_API_KEY_PRIVATE = "bad-secret";

    mockConfigureWithWallet.mockRejectedValue(
      new Error("Invalid API key")
    );

    await expect(initializeAgentWallet()).rejects.toThrow("Invalid API key");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createViemClients
// ═══════════════════════════════════════════════════════════════════════════

describe("createViemClients", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use getWalletClient when available", async () => {
    const mockWalletClient = { signTransaction: vi.fn() };
    const provider = createMockWalletProvider({
      getWalletClient: vi.fn().mockReturnValue(mockWalletClient),
    });

    const result = await createViemClients(provider);

    expect(provider.getWalletClient).toHaveBeenCalled();
    expect(result.walletClient).toBe(mockWalletClient);
    expect(result.walletAddress).toBe("0xABCDef0123456789abcDEF0123456789ABCDef01");
  });

  it("should fall back to toViemWalletClient when getWalletClient is absent", async () => {
    const mockWalletClient = { signTransaction: vi.fn() };
    const provider = createMockWalletProvider({
      getWalletClient: undefined, // Not a function
      toViemWalletClient: vi.fn().mockReturnValue(mockWalletClient),
    });

    const result = await createViemClients(provider);

    expect(provider.toViemWalletClient).toHaveBeenCalled();
    expect(result.walletClient).toBe(mockWalletClient);
  });

  it("should throw when neither wallet client method exists", async () => {
    const provider = createMockWalletProvider({
      getWalletClient: undefined,
      toViemWalletClient: undefined,
    });

    await expect(createViemClients(provider)).rejects.toThrow(
      /Could not get wallet client/
    );
  });

  it("should create a publicClient (not null)", async () => {
    const provider = createMockWalletProvider();
    const result = await createViemClients(provider);

    expect(result.publicClient).toBeDefined();
    expect(result.publicClient).not.toBeNull();
  });

  it("should use BASE_RPC_URL from env when set", async () => {
    process.env.BASE_RPC_URL = "https://custom-rpc.example.com";
    const provider = createMockWalletProvider();

    const result = await createViemClients(provider);

    // We can't easily inspect the transport URL, but the client should still be created
    expect(result.publicClient).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getWalletStatus
// ═══════════════════════════════════════════════════════════════════════════

describe("getWalletStatus", () => {
  it("should return address, balance and network", async () => {
    const provider = createMockWalletProvider();

    const status = await getWalletStatus(provider);

    expect(status.address).toBe("0xABCDef0123456789abcDEF0123456789ABCDef01");
    expect(status.balanceETH).toBe("500000000000000000");
    expect(status.network).toBe("base-mainnet");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getWalletBalance
// ═══════════════════════════════════════════════════════════════════════════

describe("getWalletBalance", () => {
  it("should read balance from public client", async () => {
    const mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(parseEther("1.5")),
    } as any;

    const balance = await getWalletBalance(
      mockPublicClient,
      "0xABCDef0123456789abcDEF0123456789ABCDef01"
    );

    expect(balance).toBe(parseEther("1.5"));
    expect(mockPublicClient.getBalance).toHaveBeenCalledWith({
      address: "0xABCDef0123456789abcDEF0123456789ABCDef01",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// testWalletConnection
// ═══════════════════════════════════════════════════════════════════════════

describe("testWalletConnection", () => {
  it("should return connected=true when all checks pass", async () => {
    const provider = createMockWalletProvider();
    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453), // Base mainnet
      getBalance: vi.fn().mockResolvedValue(parseEther("0.5")),
    } as any;

    const result = await testWalletConnection(provider, mockPublicClient);

    expect(result.connected).toBe(true);
    expect(result.address).toBe("0xABCDef0123456789abcDEF0123456789ABCDef01");
    expect(result.chainId).toBe(8453);
    expect(result.error).toBeUndefined();
  });

  it("should return connected=false when provider getAddress fails", async () => {
    const provider = createMockWalletProvider({
      getAddress: vi.fn().mockRejectedValue(new Error("Provider disconnected")),
    });
    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453),
      getBalance: vi.fn().mockResolvedValue(BigInt(0)),
    } as any;

    const result = await testWalletConnection(provider, mockPublicClient);

    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/Provider disconnected/);
  });

  it("should return connected=false when public client fails", async () => {
    const provider = createMockWalletProvider();
    const mockPublicClient = {
      getChainId: vi.fn().mockRejectedValue(new Error("RPC unreachable")),
      getBalance: vi.fn().mockResolvedValue(BigInt(0)),
    } as any;

    const result = await testWalletConnection(provider, mockPublicClient);

    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/RPC unreachable/);
  });

  it("should return connected=false when balance read fails", async () => {
    const provider = createMockWalletProvider();
    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453),
      getBalance: vi.fn().mockRejectedValue(new Error("rate limited")),
    } as any;

    const result = await testWalletConnection(provider, mockPublicClient);

    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/rate limited/);
  });

  it("should handle non-Error throws", async () => {
    const provider = createMockWalletProvider({
      getAddress: vi.fn().mockRejectedValue("string error"),
    });
    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453),
      getBalance: vi.fn().mockResolvedValue(BigInt(0)),
    } as any;

    const result = await testWalletConnection(provider, mockPublicClient);

    expect(result.connected).toBe(false);
    expect(result.error).toBe("string error");
  });
});
