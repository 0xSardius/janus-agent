import { type PublicClient, type WalletClient, decodeEventLog } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { ERC8004_CONFIG } from "../constants.js";
import type { AgentIdentity } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IdentityConfig {
  registryAddress: `0x${string}`;
  agentURI: string;
}

export interface AgentRegistrationInfo {
  name: string;
  description: string;
  walletAddress: string;
  services: string[];
  x402Enabled: boolean;
  version: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK EXISTING IDENTITY
// Returns agent ID if already registered, null otherwise
// ═══════════════════════════════════════════════════════════════════════════

export async function getExistingIdentity(
  registryAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  publicClient: PublicClient
): Promise<bigint | null> {
  try {
    const balance = await publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    }) as bigint;

    if (balance === BigInt(0)) {
      return null;
    }

    // Get the first token ID owned by this address
    const tokenId = await publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [walletAddress, BigInt(0)],
    }) as bigint;

    return tokenId;
  } catch {
    // Contract might not exist on this network yet
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER AGENT IDENTITY
// Calls register() on the IdentityRegistry, parses Registered event
// ═══════════════════════════════════════════════════════════════════════════

export async function registerAgentIdentity(
  config: IdentityConfig,
  publicClient: PublicClient,
  walletClient: WalletClient,
  walletAddress: `0x${string}`
): Promise<AgentIdentity> {
  const hash = await walletClient.writeContract({
    address: config.registryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [config.agentURI],
    account: walletAddress,
    chain: walletClient.chain,
  });

  // Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse Registered event to get token ID
  let agentId = BigInt(0);
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "Registered") {
        agentId = (decoded.args as { tokenId: bigint }).tokenId;
        break;
      }
    } catch {
      // Not our event, skip
      continue;
    }
  }

  return {
    agentId,
    registryAddress: config.registryAddress,
    walletAddress,
    registeredAt: Date.now(),
    txHash: hash,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE AGENT URI
// ═══════════════════════════════════════════════════════════════════════════

export async function updateAgentURI(
  agentId: bigint,
  newURI: string,
  registryAddress: `0x${string}`,
  walletClient: WalletClient,
  walletAddress: `0x${string}`
): Promise<string> {
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "setAgentURI",
    args: [agentId, newURI],
    account: walletAddress,
    chain: walletClient.chain,
  });

  return hash;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE AGENT REGISTRATION JSON
// Creates the agent description JSON following ERC-8004 schema
// ═══════════════════════════════════════════════════════════════════════════

export function generateAgentRegistrationJSON(info: AgentRegistrationInfo): Record<string, unknown> {
  return {
    name: info.name,
    description: info.description,
    version: info.version,
    wallet: info.walletAddress,
    services: info.services,
    capabilities: {
      x402: info.x402Enabled,
      micropayments: info.x402Enabled,
    },
    created: new Date().toISOString(),
    standard: "ERC-8004",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET REGISTRY ADDRESS
// Returns the appropriate registry address for the environment
// ═══════════════════════════════════════════════════════════════════════════

export function getRegistryAddress(): `0x${string}` {
  const envRegistry = process.env.BASE_IDENTITY_REGISTRY;
  if (envRegistry && envRegistry.startsWith("0x")) {
    return envRegistry as `0x${string}`;
  }
  return ERC8004_CONFIG.defaultBaseRegistry;
}
