import { createPublicClient, http, type PublicClient, type WalletClient } from "viem";
import { base } from "viem/chains";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// Note: CDP AgentKit types are imported dynamically to handle API changes
// ═══════════════════════════════════════════════════════════════════════════

// Using 'any' for CDP types until we integrate with actual SDK version
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CdpWalletProvider = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentKit = any;

export interface WalletProviderResult {
  walletProvider: CdpWalletProvider;
  agentKit: AgentKit;
}

// Using any due to viem version conflicts between @coinbase/agentkit and our direct viem dependency
export interface FlaunchClientResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any;
  walletAddress: `0x${string}`;
}

export interface WalletStatus {
  address: string;
  balanceETH: string;
  network: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET INITIALIZATION
// CDP Server Wallet v2 with TEE protection
// ═══════════════════════════════════════════════════════════════════════════

export async function initializeAgentWallet(): Promise<WalletProviderResult> {
  const apiKeyName = process.env.CDP_API_KEY_NAME;
  const apiKeyPrivate = process.env.CDP_API_KEY_PRIVATE;

  if (!apiKeyName || !apiKeyPrivate) {
    throw new Error(
      "CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE must be set in environment"
    );
  }

  // Dynamic import to handle API changes
  const { CdpWalletProvider, AgentKit } = await import("@coinbase/agentkit");

  // Configure CDP Wallet Provider
  // Keys are API credentials, NOT private keys
  // Note: Property names may vary by AgentKit version
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName,
    apiKeyPrivateKey: apiKeyPrivate, // Some versions use this
    networkId: "base-mainnet",
  });

  // Initialize AgentKit with wallet
  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [], // We'll use Flaunch SDK directly
  });

  return { walletProvider, agentKit };
}

// ═══════════════════════════════════════════════════════════════════════════
// FLAUNCH CLIENT SETUP
// Connect CDP wallet to viem clients for Flaunch SDK
// ═══════════════════════════════════════════════════════════════════════════

export async function createViemClients(
  walletProvider: CdpWalletProvider
): Promise<FlaunchClientResult> {
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";

  // Create public client for reading chain state
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Get viem-compatible wallet client from CDP
  // Method name may vary by AgentKit version
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let walletClient: any;
  if (typeof walletProvider.getWalletClient === "function") {
    walletClient = walletProvider.getWalletClient();
  } else if (typeof walletProvider.toViemWalletClient === "function") {
    walletClient = walletProvider.toViemWalletClient();
  } else {
    throw new Error("Could not get wallet client from CDP provider");
  }

  // Get wallet address
  const walletAddress = (await walletProvider.getAddress()) as `0x${string}`;

  return { publicClient, walletClient, walletAddress };
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export async function getWalletStatus(
  walletProvider: CdpWalletProvider
): Promise<WalletStatus> {
  const address = await walletProvider.getAddress();
  const balance = await walletProvider.getBalance();

  return {
    address,
    balanceETH: balance.toString(),
    network: "base-mainnet",
  };
}

export async function getWalletBalance(
  publicClient: PublicClient,
  address: `0x${string}`
): Promise<bigint> {
  return publicClient.getBalance({ address });
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CONNECTION TEST
// Verifies wallet provider and public client are working
// ═══════════════════════════════════════════════════════════════════════════

export async function testWalletConnection(
  walletProvider: CdpWalletProvider,
  publicClient: PublicClient
): Promise<{ connected: boolean; address: string; chainId: number; error?: string }> {
  try {
    const address = await walletProvider.getAddress();
    const chainId = await publicClient.getChainId();

    // Verify we can read from the chain
    await publicClient.getBalance({ address });

    return {
      connected: true,
      address,
      chainId,
    };
  } catch (error) {
    return {
      connected: false,
      address: "",
      chainId: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** @deprecated Use createViemClients instead */
export const createFlaunchClient = createViemClients;
