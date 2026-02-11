import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @flaunch/sdk module
vi.mock("@flaunch/sdk", () => ({
  createFlaunch: vi.fn(),
}));

import { createFlaunchWrapper } from "./client.js";
import { createFlaunch as createFlaunchSDK } from "@flaunch/sdk";
import type { PublicClient, WalletClient } from "viem";

describe("createFlaunchWrapper", () => {
  const mockPublicClient = {} as PublicClient;
  const mockWalletClient = {} as WalletClient;

  let mockSdk: {
    flaunchIPFS: ReturnType<typeof vi.fn>;
    getPoolCreatedFromTx: ReturnType<typeof vi.fn>;
    buyCoin: ReturnType<typeof vi.fn>;
    sellCoin: ReturnType<typeof vi.fn>;
    withdrawCreatorRevenue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSdk = {
      flaunchIPFS: vi.fn(),
      getPoolCreatedFromTx: vi.fn(),
      buyCoin: vi.fn(),
      sellCoin: vi.fn(),
      withdrawCreatorRevenue: vi.fn(),
    };
    vi.mocked(createFlaunchSDK).mockReturnValue(mockSdk as any);
  });

  it("creates SDK with correct clients", () => {
    createFlaunchWrapper(mockPublicClient, mockWalletClient);
    expect(createFlaunchSDK).toHaveBeenCalledWith({
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });
  });

  it("flaunchIPFS forwards params correctly", async () => {
    mockSdk.flaunchIPFS.mockResolvedValue("0xtxhash");

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const hash = await wrapper.flaunchIPFS({
      name: "Test Token",
      symbol: "TEST",
      fairLaunchPercent: 0,
      fairLaunchDuration: 1800,
      initialMarketCapUSD: 10000,
      creator: "0xagent",
      creatorFeeAllocationPercent: 100,
      metadata: { base64Image: "base64...", description: "A test token" },
    });

    expect(hash).toBe("0xtxhash");
    expect(mockSdk.flaunchIPFS).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Token",
        symbol: "TEST",
        creator: "0xagent",
        metadata: { base64Image: "base64...", description: "A test token" },
      })
    );
  });

  it("getPoolCreatedFromTx returns parsed data", async () => {
    mockSdk.getPoolCreatedFromTx.mockResolvedValue({
      memecoin: "0xmemecoin",
      tokenId: BigInt(42),
      poolId: "0xpool",
      memecoinTreasury: "0xtreasury",
      currencyFlipped: false,
      flaunchFee: BigInt(0),
      params: {},
    });

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const result = await wrapper.getPoolCreatedFromTx("0xtx");

    expect(result).not.toBeNull();
    expect(result!.memecoin).toBe("0xmemecoin");
    expect(result!.tokenId).toBe(BigInt(42));
    expect(result!.poolId).toBe("0xpool");
  });

  it("getPoolCreatedFromTx returns null when SDK returns null", async () => {
    mockSdk.getPoolCreatedFromTx.mockResolvedValue(null);

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const result = await wrapper.getPoolCreatedFromTx("0xtx");
    expect(result).toBeNull();
  });

  it("buyCoin calls SDK with EXACT_IN and slippagePercent", async () => {
    mockSdk.buyCoin.mockResolvedValue("0xbuytx");

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const hash = await wrapper.buyCoin({
      coinAddress: "0xcoin",
      amountIn: BigInt(3000000000000000),
      slippagePercent: 5,
    });

    expect(hash).toBe("0xbuytx");
    expect(mockSdk.buyCoin).toHaveBeenCalledWith({
      coinAddress: "0xcoin",
      swapType: "EXACT_IN",
      amountIn: BigInt(3000000000000000),
      slippagePercent: 5,
    });
  });

  it("sellCoin calls SDK with correct params", async () => {
    mockSdk.sellCoin.mockResolvedValue("0xselltx");

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const hash = await wrapper.sellCoin({
      coinAddress: "0xcoin",
      amountIn: BigInt(1000000),
      slippagePercent: 5,
    });

    expect(hash).toBe("0xselltx");
    expect(mockSdk.sellCoin).toHaveBeenCalledWith({
      coinAddress: "0xcoin",
      amountIn: BigInt(1000000),
      slippagePercent: 5,
    });
  });

  it("withdrawCreatorRevenue forwards recipient", async () => {
    mockSdk.withdrawCreatorRevenue.mockResolvedValue("0xclaim");

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    const hash = await wrapper.withdrawCreatorRevenue("0xrecipient");

    expect(hash).toBe("0xclaim");
    expect(mockSdk.withdrawCreatorRevenue).toHaveBeenCalledWith({
      recipient: "0xrecipient",
    });
  });

  it("flaunchIPFS defaults empty base64Image to empty string", async () => {
    mockSdk.flaunchIPFS.mockResolvedValue("0xtx");

    const wrapper = createFlaunchWrapper(mockPublicClient, mockWalletClient);
    await wrapper.flaunchIPFS({
      name: "Test",
      symbol: "T",
      fairLaunchPercent: 0,
      fairLaunchDuration: 1800,
      initialMarketCapUSD: 10000,
      creator: "0xagent",
      creatorFeeAllocationPercent: 100,
      metadata: { description: "No image" },
    });

    expect(mockSdk.flaunchIPFS).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { base64Image: "", description: "No image" },
      })
    );
  });
});
