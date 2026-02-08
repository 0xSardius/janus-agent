// ═══════════════════════════════════════════════════════════════════════════
// ERC-8004 IdentityRegistry — Minimal ABI (viem format)
// ═══════════════════════════════════════════════════════════════════════════

export const IDENTITY_REGISTRY_ABI = [
  // Register a new agent identity
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentURI", type: "string" },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
    ],
  },

  // Check how many identities an address owns
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
    ],
    outputs: [
      { name: "", type: "uint256" },
    ],
  },

  // Get token ID by index for a given owner
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint256" },
    ],
  },

  // Update agent URI (metadata)
  {
    name: "setAgentURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "agentURI", type: "string" },
    ],
    outputs: [],
  },

  // Get agent URI (metadata)
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [
      { name: "", type: "string" },
    ],
  },

  // Registration event
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
    ],
  },
] as const;
