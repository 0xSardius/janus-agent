import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

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
// WALLET MODE SELECTION
// Supports two modes:
//   1. LOCAL — Private key via WALLET_PRIVATE_KEY env var (recommended)
//   2. CDP   — CDP Server Wallet via API keys (requires CDP API, rate-limited)
// ═══════════════════════════════════════════════════════════════════════════

export async function initializeAgentWallet(): Promise<WalletProviderResult> {
  // Prefer local private key wallet (no API calls, no rate limits)
  if (process.env.WALLET_PRIVATE_KEY) {
    return initializeLocalWallet();
  }

  // Fall back to CDP wallet
  return initializeCdpWallet();
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL WALLET (viem private key)
// Simple, fast, no external API dependencies
// ═══════════════════════════════════════════════════════════════════════════

async function initializeLocalWallet(): Promise<WalletProviderResult> {
  const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;

  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    throw new Error(
      "WALLET_PRIVATE_KEY must be a 0x-prefixed 64-character hex string"
    );
  }

  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Wrap in AgentKit-compatible ViemWalletProvider
  const { ViemWalletProvider, AgentKit } = await import("@coinbase/agentkit");
  const walletProvider = new ViemWalletProvider(walletClient as any);

  // Expose walletClient for createViemClients (ViemWalletProvider stores it privately)
  (walletProvider as any)._viemWalletClient = walletClient;

  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [],
  });

  console.log(`\nLocal wallet initialized: ${account.address}`);
  console.log(`   Network: Base Mainnet (chain ID 8453)\n`);

  return { walletProvider, agentKit };
}

// ═══════════════════════════════════════════════════════════════════════════
// CDP WALLET (Coinbase Server Wallet v2)
// Requires CDP_API_KEY_NAME + CDP_API_KEY_PRIVATE
// ═══════════════════════════════════════════════════════════════════════════

async function initializeCdpWallet(): Promise<WalletProviderResult> {
  const apiKeyName = process.env.CDP_API_KEY_NAME;
  const apiKeyPrivate = process.env.CDP_API_KEY_PRIVATE;

  if (!apiKeyName || !apiKeyPrivate) {
    throw new Error(
      "Either WALLET_PRIVATE_KEY or CDP_API_KEY_NAME + CDP_API_KEY_PRIVATE must be set"
    );
  }

  // Dynamic import to handle API changes
  const { CdpWalletProvider, AgentKit } = await import("@coinbase/agentkit");

  // Check for persisted wallet data (reuses same wallet across restarts)
  const cdpWalletData = process.env.CDP_WALLET_DATA || undefined;

  // Configure CDP Wallet Provider
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName,
    apiKeyPrivateKey: apiKeyPrivate,
    networkId: "base-mainnet",
    cdpWalletData,
  });

  // If this is a brand-new wallet, export and log for persistence
  if (!cdpWalletData) {
    try {
      const exportedWallet = await walletProvider.exportWallet();
      const walletJson = JSON.stringify(exportedWallet);
      console.log("\n╔══════════════════════════════════════════════════════════╗");
      console.log("║  NEW WALLET CREATED — SAVE THIS TO YOUR .env FILE:      ║");
      console.log("╠══════════════════════════════════════════════════════════╣");
      console.log(`║  CDP_WALLET_DATA='${walletJson}'`);
      console.log("╚══════════════════════════════════════════════════════════╝\n");
    } catch {
      console.warn("Could not export wallet data. Wallet may not persist across restarts.");
    }
  }

  // Initialize AgentKit with wallet
  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [],
  });

  return { walletProvider, agentKit };
}

// ═══════════════════════════════════════════════════════════════════════════
// FLAUNCH CLIENT SETUP
// Connect wallet to viem clients for Flaunch SDK
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

  // Get viem-compatible wallet client from provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let walletClient: any;
  if (walletProvider._viemWalletClient) {
    // Local wallet mode — walletClient was stashed during init
    walletClient = walletProvider._viemWalletClient;
  } else if (typeof walletProvider.getWalletClient === "function") {
    walletClient = walletProvider.getWalletClient();
  } else if (typeof walletProvider.toViemWalletClient === "function") {
    walletClient = walletProvider.toViemWalletClient();
  } else {
    throw new Error("Could not get wallet client from provider");
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
