import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { createPublicClient, http, type PublicClient, type WalletClient } from "viem";
import { base } from "viem/chains";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WalletProviderResult {
  walletProvider: CdpWalletProvider;
  agentKit: AgentKit;
}

export interface FlaunchClientResult {
  publicClient: PublicClient;
  walletClient: WalletClient;
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

  // Configure CDP Wallet Provider
  // Keys are API credentials, NOT private keys
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName,
    apiKeyPrivate,
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

export async function createFlaunchClient(
  walletProvider: CdpWalletProvider
): Promise<FlaunchClientResult> {
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";

  // Get viem-compatible wallet client from CDP
  const walletClient = walletProvider.getWalletClient() as WalletClient;

  // Create public client for reading chain state
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Get wallet address
  const walletAddress = await walletProvider.getAddress() as `0x${string}`;

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
