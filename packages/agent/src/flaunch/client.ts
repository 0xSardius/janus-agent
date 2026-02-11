import type { PublicClient, WalletClient, Hash, Address } from "viem";
import { createFlaunch as createFlaunchSDK } from "@flaunch/sdk";

// ═══════════════════════════════════════════════════════════════════════════
// FLAUNCH CLIENT INTERFACE
// Our internal interface that the rest of the codebase uses.
// The wrapper adapts the real SDK to this interface.
// ═══════════════════════════════════════════════════════════════════════════

export interface FlaunchClient {
  flaunchIPFS(params: {
    name: string;
    symbol: string;
    fairLaunchPercent: number;
    fairLaunchDuration: number;
    initialMarketCapUSD: number;
    creator: Address;
    creatorFeeAllocationPercent: number;
    metadata: {
      base64Image?: string;
      description: string;
    };
  }): Promise<Hash>;

  getPoolCreatedFromTx(hash: Hash): Promise<{
    memecoin: Address;
    tokenId: bigint;
    poolId: string;
  } | null>;

  buyCoin(params: {
    coinAddress: Address;
    amountIn: bigint;
    slippagePercent: number;
  }): Promise<Hash>;

  sellCoin(params: {
    coinAddress: Address;
    amountIn: bigint;
    slippagePercent: number;
  }): Promise<Hash>;

  withdrawCreatorRevenue(recipient?: Address): Promise<Hash>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER FACTORY
// Adapts the real @flaunch/sdk to our internal interface
// ═══════════════════════════════════════════════════════════════════════════

export function createFlaunchWrapper(
  publicClient: PublicClient,
  walletClient: WalletClient
): FlaunchClient {
  const sdk = createFlaunchSDK({ publicClient, walletClient });

  return {
    async flaunchIPFS(params) {
      const hash = await sdk.flaunchIPFS({
        name: params.name,
        symbol: params.symbol,
        fairLaunchPercent: params.fairLaunchPercent,
        fairLaunchDuration: params.fairLaunchDuration,
        initialMarketCapUSD: params.initialMarketCapUSD,
        creator: params.creator,
        creatorFeeAllocationPercent: params.creatorFeeAllocationPercent,
        metadata: {
          base64Image: params.metadata.base64Image || "",
          description: params.metadata.description,
        },
      });
      return hash;
    },

    async getPoolCreatedFromTx(hash) {
      const result = await sdk.getPoolCreatedFromTx(hash);
      if (!result) return null;
      return {
        memecoin: result.memecoin,
        tokenId: result.tokenId,
        poolId: result.poolId,
      };
    },

    async buyCoin(params) {
      const hash = await sdk.buyCoin({
        coinAddress: params.coinAddress,
        swapType: "EXACT_IN",
        amountIn: params.amountIn,
        slippagePercent: params.slippagePercent,
      });
      return hash;
    },

    async sellCoin(params) {
      const hash = await sdk.sellCoin({
        coinAddress: params.coinAddress,
        amountIn: params.amountIn,
        slippagePercent: params.slippagePercent,
      });
      return hash;
    },

    async withdrawCreatorRevenue(recipient) {
      const hash = await sdk.withdrawCreatorRevenue({
        recipient,
      });
      return hash;
    },
  };
}
