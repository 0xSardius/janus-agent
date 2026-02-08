import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getExistingIdentity,
  registerAgentIdentity,
  updateAgentURI,
  generateAgentRegistrationJSON,
  getRegistryAddress,
  type IdentityConfig,
  type AgentRegistrationInfo,
} from "./erc8004.js";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { ERC8004_CONFIG } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_REGISTRY = "0x8004e3e07100dFbE22800a5025b1A8a2037aa65C" as `0x${string}`;
const MOCK_WALLET = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
const MOCK_TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`;

function createMockPublicClient(overrides: Record<string, unknown> = {}) {
  return {
    readContract: vi.fn().mockResolvedValue(BigInt(0)),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      logs: [],
      status: "success",
    }),
    ...overrides,
  };
}

function createMockWalletClient() {
  return {
    writeContract: vi.fn().mockResolvedValue(MOCK_TX_HASH),
    chain: { id: 8453, name: "Base" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET EXISTING IDENTITY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("getExistingIdentity", () => {
  it("should return null when no identity exists", async () => {
    const publicClient = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
    });

    const result = await getExistingIdentity(
      MOCK_REGISTRY,
      MOCK_WALLET,
      publicClient as any
    );

    expect(result).toBeNull();
  });

  it("should return token ID when identity exists", async () => {
    const readContract = vi.fn()
      .mockResolvedValueOnce(BigInt(1)) // balanceOf returns 1
      .mockResolvedValueOnce(BigInt(42)); // tokenOfOwnerByIndex returns 42

    const publicClient = createMockPublicClient({ readContract });

    const result = await getExistingIdentity(
      MOCK_REGISTRY,
      MOCK_WALLET,
      publicClient as any
    );

    expect(result).toBe(BigInt(42));
  });

  it("should call balanceOf with correct params", async () => {
    const readContract = vi.fn().mockResolvedValue(BigInt(0));
    const publicClient = createMockPublicClient({ readContract });

    await getExistingIdentity(MOCK_REGISTRY, MOCK_WALLET, publicClient as any);

    expect(readContract).toHaveBeenCalledWith({
      address: MOCK_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "balanceOf",
      args: [MOCK_WALLET],
    });
  });

  it("should return null if contract call fails", async () => {
    const publicClient = createMockPublicClient({
      readContract: vi.fn().mockRejectedValue(new Error("Contract not found")),
    });

    const result = await getExistingIdentity(
      MOCK_REGISTRY,
      MOCK_WALLET,
      publicClient as any
    );

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER AGENT IDENTITY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("registerAgentIdentity", () => {
  it("should call writeContract with register function", async () => {
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient();

    const config: IdentityConfig = {
      registryAddress: MOCK_REGISTRY,
      agentURI: "https://agent.example.com/metadata.json",
    };

    await registerAgentIdentity(
      config,
      publicClient as any,
      walletClient as any,
      MOCK_WALLET
    );

    expect(walletClient.writeContract).toHaveBeenCalledWith({
      address: MOCK_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "register",
      args: ["https://agent.example.com/metadata.json"],
      account: MOCK_WALLET,
      chain: walletClient.chain,
    });
  });

  it("should return AgentIdentity with tx hash", async () => {
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient();

    const config: IdentityConfig = {
      registryAddress: MOCK_REGISTRY,
      agentURI: "https://agent.example.com/metadata.json",
    };

    const result = await registerAgentIdentity(
      config,
      publicClient as any,
      walletClient as any,
      MOCK_WALLET
    );

    expect(result.txHash).toBe(MOCK_TX_HASH);
    expect(result.registryAddress).toBe(MOCK_REGISTRY);
    expect(result.walletAddress).toBe(MOCK_WALLET);
    expect(result.registeredAt).toBeGreaterThan(0);
  });

  it("should wait for transaction receipt", async () => {
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient();

    const config: IdentityConfig = {
      registryAddress: MOCK_REGISTRY,
      agentURI: "https://agent.example.com/metadata.json",
    };

    await registerAgentIdentity(
      config,
      publicClient as any,
      walletClient as any,
      MOCK_WALLET
    );

    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: MOCK_TX_HASH,
    });
  });

  it("should default agentId to 0 when event not found", async () => {
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        logs: [],
        status: "success",
      }),
    });

    const config: IdentityConfig = {
      registryAddress: MOCK_REGISTRY,
      agentURI: "https://agent.example.com/metadata.json",
    };

    const result = await registerAgentIdentity(
      config,
      publicClient as any,
      walletClient as any,
      MOCK_WALLET
    );

    expect(result.agentId).toBe(BigInt(0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE AGENT URI TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("updateAgentURI", () => {
  it("should call writeContract with setAgentURI function", async () => {
    const walletClient = createMockWalletClient();

    await updateAgentURI(
      BigInt(42),
      "https://new-uri.example.com/metadata.json",
      MOCK_REGISTRY,
      walletClient as any,
      MOCK_WALLET
    );

    expect(walletClient.writeContract).toHaveBeenCalledWith({
      address: MOCK_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "setAgentURI",
      args: [BigInt(42), "https://new-uri.example.com/metadata.json"],
      account: MOCK_WALLET,
      chain: walletClient.chain,
    });
  });

  it("should return transaction hash", async () => {
    const walletClient = createMockWalletClient();

    const hash = await updateAgentURI(
      BigInt(42),
      "https://new-uri.example.com/metadata.json",
      MOCK_REGISTRY,
      walletClient as any,
      MOCK_WALLET
    );

    expect(hash).toBe(MOCK_TX_HASH);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION JSON GENERATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("generateAgentRegistrationJSON", () => {
  const info: AgentRegistrationInfo = {
    name: "Janus Token Launcher",
    description: "Autonomous meme token launcher",
    walletAddress: MOCK_WALLET,
    services: ["token-launch", "position-management"],
    x402Enabled: true,
    version: "0.1.0",
  };

  it("should include agent name and description", () => {
    const json = generateAgentRegistrationJSON(info);

    expect(json.name).toBe("Janus Token Launcher");
    expect(json.description).toBe("Autonomous meme token launcher");
  });

  it("should include wallet address", () => {
    const json = generateAgentRegistrationJSON(info);

    expect(json.wallet).toBe(MOCK_WALLET);
  });

  it("should include services array", () => {
    const json = generateAgentRegistrationJSON(info);

    expect(json.services).toEqual(["token-launch", "position-management"]);
  });

  it("should include x402 capabilities when enabled", () => {
    const json = generateAgentRegistrationJSON(info);

    expect((json.capabilities as any).x402).toBe(true);
    expect((json.capabilities as any).micropayments).toBe(true);
  });

  it("should set x402 to false when disabled", () => {
    const json = generateAgentRegistrationJSON({ ...info, x402Enabled: false });

    expect((json.capabilities as any).x402).toBe(false);
  });

  it("should include ERC-8004 standard marker", () => {
    const json = generateAgentRegistrationJSON(info);

    expect(json.standard).toBe("ERC-8004");
  });

  it("should include creation timestamp", () => {
    const json = generateAgentRegistrationJSON(info);

    expect(json.created).toBeDefined();
    expect(typeof json.created).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY ADDRESS TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("getRegistryAddress", () => {
  it("should return default registry when env not set", () => {
    delete process.env.BASE_IDENTITY_REGISTRY;

    const address = getRegistryAddress();

    expect(address).toBe(ERC8004_CONFIG.defaultBaseRegistry);
  });

  it("should return env override when set", () => {
    process.env.BASE_IDENTITY_REGISTRY = "0xCustomRegistryAddress1234567890abcdef1234";

    const address = getRegistryAddress();

    expect(address).toBe("0xCustomRegistryAddress1234567890abcdef1234");

    delete process.env.BASE_IDENTITY_REGISTRY;
  });

  it("should return default when env is invalid (not 0x prefixed)", () => {
    process.env.BASE_IDENTITY_REGISTRY = "notanaddress";

    const address = getRegistryAddress();

    expect(address).toBe(ERC8004_CONFIG.defaultBaseRegistry);

    delete process.env.BASE_IDENTITY_REGISTRY;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ABI TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("IDENTITY_REGISTRY_ABI", () => {
  it("should contain register function", () => {
    const registerFn = IDENTITY_REGISTRY_ABI.find(
      (item) => item.type === "function" && item.name === "register"
    );
    expect(registerFn).toBeDefined();
  });

  it("should contain balanceOf function", () => {
    const fn = IDENTITY_REGISTRY_ABI.find(
      (item) => item.type === "function" && item.name === "balanceOf"
    );
    expect(fn).toBeDefined();
  });

  it("should contain Registered event", () => {
    const event = IDENTITY_REGISTRY_ABI.find(
      (item) => item.type === "event" && item.name === "Registered"
    );
    expect(event).toBeDefined();
  });
});
