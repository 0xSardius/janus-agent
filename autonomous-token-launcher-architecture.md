# Autonomous Token Launcher: Technical Architecture Deep-Dive

## Executive Summary

This document outlines the technical architecture for an autonomous AI agent that monitors token trends, iterates on successful concepts, and programmatically launches tokens on Flaunch. The system leverages:

- **Daydreams AI** - Composable agent framework with persistent memory
- **CDP AgentKit + Server Wallet v2** - Secure wallet infrastructure with TEE protection
- **Flaunch SDK** - Programmatic token launches on Base
- **x402** - Micropayment protocol for API access
- **ERC-8004** - On-chain agent identity and reputation
- **Railway** - Cloud deployment for 24/7 autonomous operation

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DAYDREAMS AGENT CORE                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐    │
│  │  Monitor   │ │  Analyzer  │ │  Creator   │ │  Launcher  │ │   Position     │    │
│  │  Context   │ │  Context   │ │  Context   │ │  Context   │ │   Manager      │    │
│  │            │ │            │ │            │ │            │ │                │    │
│  │ • Poll     │ │ • Trend ML │ │ • Name gen │ │ • SDK call │ │ • Buy at launch│    │
│  │ • Filter   │ │ • Scoring  │ │ • Image    │ │ • Gas mgmt │ │ • Monitor P&L  │    │
│  │ • Queue    │ │ • Select   │ │ • Metadata │ │ • NFT claim│ │ • Staged exits │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────────┘    │
│         │              │              │              │              │                │
│         └──────────────┴──────────────┴──────┬───────┴──────────────┘                │
│                                               │                                      │
│  ┌───────────────────────────────────────────▼──────────────────────────────────┐   │
│  │                           SHARED STATE & MEMORY                               │   │
│  │  • Launch history  • Trend patterns  • Performance metrics  • Budget          │   │
│  │  • Active positions  • P&L tracking  • Exit triggers  • Portfolio value       │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Flaunch    │    │    x402      │    │  ERC-8004    │    │   External   │
│   Subgraph   │    │   Gateway    │    │   Registry   │    │    APIs      │
│              │    │              │    │              │    │              │
│ • New tokens │    │ • Pay for    │    │ • Agent ID   │    │ • Twitter    │
│ • Swap data  │    │   API calls  │    │ • Reputation │    │ • Trends     │
│ • Volume     │    │ • Receive    │    │ • Validation │    │ • Images     │
│ • Revenue    │    │   revenue    │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Wallet Architecture: CDP Server Wallet v2 + AgentKit

### Why CDP Server Wallet v2?

For an autonomous agent managing real funds, wallet security is critical. We use **Coinbase Developer Platform (CDP) Server Wallet v2** via **AgentKit** because:

| Feature | Benefit |
|---------|---------|
| **TEE Protection** | Private keys secured in AWS Nitro Enclave - never exposed to Coinbase, AWS, or your code |
| **API-Based Signing** | No private keys in environment variables or code |
| **Native Base Support** | First-class support for Base network (where Flaunch operates) |
| **viem Compatible** | Direct integration with Flaunch SDK |
| **AgentKit Integration** | Purpose-built for autonomous AI agents |
| **Free Tier** | No cost to start |

### Wallet Options Comparison

| Solution | Security | Setup | Cost | Risk Profile |
|----------|----------|-------|------|--------------|
| **CDP Server Wallet v2** ✅ | TEE (AWS Nitro) | Medium | Free | Production-ready |
| **Privy Server Wallet** | TEE + key sharding | Medium | Paid | Enterprise features |
| **Hot Wallet (env var)** ⚠️ | Low | Easy | Free | Testnet only |

### AgentKit Integration

```typescript
// packages/agent/src/wallet/provider.ts
import { AgentKit } from "@coinbase/agentkit";
import { CdpWalletProvider } from "@coinbase/agentkit";
import { createFlaunch } from "@flaunch/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// ═══════════════════════════════════════════════════════════════════════════
// WALLET INITIALIZATION
// CDP Server Wallet v2 with TEE protection
// ═══════════════════════════════════════════════════════════════════════════

export async function initializeAgentWallet() {
  // Configure CDP Wallet Provider
  // Keys are API credentials, NOT private keys
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName: process.env.CDP_API_KEY_NAME!,
    apiKeyPrivate: process.env.CDP_API_KEY_PRIVATE!,
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
// FLAUNCH INTEGRATION
// Connect CDP wallet to Flaunch SDK
// ═══════════════════════════════════════════════════════════════════════════

export async function createFlaunchClient(walletProvider: CdpWalletProvider) {
  // Get viem-compatible wallet client from CDP
  const walletClient = walletProvider.getWalletClient();
  
  // Create public client for reading chain state
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // Initialize Flaunch with CDP-secured wallet
  const flaunch = createFlaunch({
    publicClient,
    walletClient,
  });

  return { flaunch, publicClient, walletClient };
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export async function getWalletStatus(walletProvider: CdpWalletProvider) {
  const address = await walletProvider.getAddress();
  const balance = await walletProvider.getBalance();
  
  return {
    address,
    balanceETH: balance.toString(),
    network: "base-mainnet",
  };
}
```

### Environment Configuration

```bash
# .env.example

# ═══════════════════════════════════════════════════════════════════════════
# CDP CREDENTIALS (from https://portal.cdp.coinbase.com)
# These are API keys, NOT private keys - safe for Railway env vars
# ═══════════════════════════════════════════════════════════════════════════
CDP_API_KEY_NAME=your-api-key-name
CDP_API_KEY_PRIVATE=your-api-key-private

# ═══════════════════════════════════════════════════════════════════════════
# RPC ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
# Or use public RPC for testing: https://mainnet.base.org

# ═══════════════════════════════════════════════════════════════════════════
# FLAUNCH SUBGRAPH
# ═══════════════════════════════════════════════════════════════════════════
FLAUNCH_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_.../subgraphs/flaunch-base/1.0.0/gn

# ═══════════════════════════════════════════════════════════════════════════
# AI / LLM
# ═══════════════════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-...
# Or use Dreams Router for x402 payments

# ═══════════════════════════════════════════════════════════════════════════
# OPTIONAL: Image Generation
# ═══════════════════════════════════════════════════════════════════════════
REPLICATE_API_KEY=r8_...
```

### CDP Setup Steps

1. **Create CDP Account**: Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
2. **Generate API Keys**: Navigate to API Keys → Create new key
3. **Create Server Wallet**: Use the SDK to create a wallet (done automatically on first init)
4. **Fund Wallet**: Send ETH to the wallet address for gas
5. **Deploy**: Set env vars in Railway and deploy

---

## Component Deep-Dive

### 1. Daydreams Agent Core

Daydreams provides the composable context architecture that makes this agent possible. Here's the concrete implementation structure:

```typescript
// packages/agent/src/index.ts
import { createDreams, context, action } from "@daydreamsai/core";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createFlaunch } from "@flaunch/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { CdpWalletProvider } from "@coinbase/agentkit";
import { initializeAgentWallet, createFlaunchClient } from "./wallet/provider";

// Initialize CDP-secured wallet and Flaunch client
const { walletProvider } = await initializeAgentWallet();
const { flaunch, publicClient, walletClient } = await createFlaunchClient(walletProvider);

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT 1: MONITOR CONTEXT
// Polls Flaunch subgraph for new tokens and trending activity
// ═══════════════════════════════════════════════════════════════════════════

const monitorContext = context({
  type: "monitor",
  schema: z.object({
    pollIntervalMs: z.number().default(30000),
    minVolumeThreshold: z.string(), // in ETH
  }),
  create: () => ({
    lastPollTimestamp: 0,
    recentTokens: [] as TokenData[],
    trendingConcepts: [] as string[],
  }),
}).setActions([
  action({
    name: "pollNewTokens",
    description: "Fetch newly launched tokens from Flaunch subgraph",
    schema: z.object({ since: z.number() }),
    handler: async ({ since }, ctx) => {
      const query = `
        query RecentTokens($since: Int!) {
          pools(
            where: { createdAt_gte: $since }
            orderBy: volumeETH
            orderDirection: desc
            first: 50
          ) {
            id
            memecoin { address symbol name }
            volumeETH
            totalRevenue
            createdAt
            tokenUri
          }
        }
      `;
      
      const response = await fetch(FLAUNCH_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { since } }),
      });
      
      const { data } = await response.json();
      ctx.memory.recentTokens = data.pools;
      ctx.memory.lastPollTimestamp = Date.now();
      
      return { tokensFound: data.pools.length };
    },
  }),
  
  action({
    name: "extractTrendingConcepts",
    description: "Analyze token names/symbols for trending themes",
    schema: z.object({}),
    handler: async (_, ctx) => {
      // Use LLM to extract concepts from recent successful tokens
      const concepts = await extractConceptsWithLLM(ctx.memory.recentTokens);
      ctx.memory.trendingConcepts = concepts;
      return { concepts };
    },
  }),
]);

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT 2: ANALYZER CONTEXT
// Scores trends and selects launch candidates
// ═══════════════════════════════════════════════════════════════════════════

const analyzerContext = context({
  type: "analyzer",
  create: () => ({
    scoredConcepts: [] as ScoredConcept[],
    launchQueue: [] as LaunchCandidate[],
    historicalPerformance: new Map<string, number>(),
  }),
})
  // Compose with monitor context to access trending data
  .use((state) => [{ context: monitorContext, args: state.args }])
  .setActions([
    action({
      name: "scoreConcepts",
      description: "Score trending concepts based on multiple factors",
      schema: z.object({
        concepts: z.array(z.string()),
      }),
      handler: async ({ concepts }, ctx) => {
        const scored = await Promise.all(
          concepts.map(async (concept) => {
            const score = await calculateConceptScore(concept, {
              // Volume of related tokens
              volumeWeight: 0.3,
              // Recency of trend
              recencyWeight: 0.25,
              // Social buzz (via x402-gated API)
              socialWeight: 0.25,
              // Novelty (not oversaturated)
              noveltyWeight: 0.2,
            });
            return { concept, score };
          })
        );
        
        ctx.memory.scoredConcepts = scored.sort((a, b) => b.score - a.score);
        return { topConcepts: scored.slice(0, 5) };
      },
    }),
    
    action({
      name: "selectLaunchCandidate",
      description: "Select the best concept for next launch",
      schema: z.object({ minScore: z.number().default(0.7) }),
      handler: async ({ minScore }, ctx) => {
        const candidate = ctx.memory.scoredConcepts.find(
          (c) => c.score >= minScore
        );
        
        if (candidate) {
          ctx.memory.launchQueue.push({
            concept: candidate.concept,
            selectedAt: Date.now(),
            score: candidate.score,
          });
        }
        
        return { selected: candidate || null };
      },
    }),
  ]);

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT 3: CREATOR CONTEXT
// Generates token metadata (name, symbol, image, description)
// ═══════════════════════════════════════════════════════════════════════════

const creatorContext = context({
  type: "creator",
  create: () => ({
    pendingTokens: [] as TokenMetadata[],
    generatedImages: new Map<string, string>(),
  }),
})
  .use((state) => [{ context: analyzerContext, args: state.args }])
  .setActions([
    action({
      name: "generateTokenConcept",
      description: "Generate creative token name, symbol, and description",
      schema: z.object({
        baseConcept: z.string(),
        iterationType: z.enum(["derivative", "mashup", "meta", "contrarian"]),
      }),
      handler: async ({ baseConcept, iterationType }, ctx) => {
        // Use LLM to generate creative variations
        const prompt = buildConceptPrompt(baseConcept, iterationType);
        const generated = await generateWithLLM(prompt);
        
        return {
          name: generated.name,
          symbol: generated.symbol.slice(0, 6), // Flaunch limit for X cashtags
          description: generated.description,
        };
      },
    }),
    
    action({
      name: "generateTokenImage",
      description: "Generate token image via x402-gated image API",
      schema: z.object({
        name: z.string(),
        description: z.string(),
        style: z.enum(["meme", "abstract", "mascot", "logo"]).default("meme"),
      }),
      handler: async ({ name, description, style }, ctx) => {
        // Pay for image generation via x402
        const imagePrompt = `${style} style crypto token image for "${name}": ${description}`;
        
        const response = await fetch("https://image-gen-api.example.com/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // x402 payment header automatically added by middleware
          },
          body: JSON.stringify({ prompt: imagePrompt }),
        });
        
        const { base64Image } = await response.json();
        ctx.memory.generatedImages.set(name, base64Image);
        
        return { imageGenerated: true };
      },
    }),
  ]);

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT 4: LAUNCHER CONTEXT
// Executes token launches via Flaunch SDK
// ═══════════════════════════════════════════════════════════════════════════

const launcherContext = context({
  type: "launcher",
  schema: z.object({
    agentWallet: z.string(),
    maxGasPriceGwei: z.number().default(50),
    creatorFeePercent: z.number().default(100), // Agent keeps all fees
  }),
  create: () => ({
    launchedTokens: [] as LaunchedToken[],
    totalRevenue: BigInt(0),
    pendingClaims: [] as string[],
  }),
})
  .use((state) => [{ context: creatorContext, args: state.args }])
  .setActions([
    action({
      name: "launchToken",
      description: "Deploy token to Flaunch",
      schema: z.object({
        name: z.string(),
        symbol: z.string(),
        description: z.string(),
        base64Image: z.string(),
        initialMarketCapUSD: z.number().default(10_000),
        fairLaunchDuration: z.number().default(30 * 60), // 30 mins
      }),
      handler: async (params, ctx) => {
        // Use the CDP-secured wallet client initialized at startup
        const flaunchWrite = createFlaunch({
          publicClient,
          walletClient,
        });
        
        const hash = await flaunchWrite.flaunchIPFS({
          name: params.name,
          symbol: params.symbol,
          fairLaunchPercent: 0,
          fairLaunchDuration: params.fairLaunchDuration,
          initialMarketCapUSD: params.initialMarketCapUSD,
          creator: ctx.args.agentWallet,
          creatorFeeAllocationPercent: ctx.args.creatorFeePercent,
          metadata: {
            base64Image: params.base64Image,
            description: params.description,
          },
        });
        
        // Parse transaction to get token address and NFT ID
        const poolCreatedData = await flaunchWrite.getPoolCreatedFromTx(hash);
        
        if (poolCreatedData) {
          ctx.memory.launchedTokens.push({
            address: poolCreatedData.memecoin,
            tokenId: poolCreatedData.tokenId,
            name: params.name,
            symbol: params.symbol,
            launchedAt: Date.now(),
            txHash: hash,
          });
        }
        
        return { 
          success: true, 
          txHash: hash,
          tokenAddress: poolCreatedData?.memecoin,
        };
      },
    }),
    
    action({
      name: "claimRevenue",
      description: "Claim accumulated trading fees from Meme Stream",
      schema: z.object({ tokenId: z.bigint() }),
      handler: async ({ tokenId }, ctx) => {
        // Use the CDP-secured wallet client
        const flaunchWrite = createFlaunch({ publicClient, walletClient });
        
        // Claim from the Position Manager
        const hash = await flaunchWrite.claimFees(tokenId);
        
        return { claimed: true, txHash: hash };
      },
    }),
  ]);

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT 5: POSITION MANAGER CONTEXT
// Buys agent's own tokens at launch and manages staged exits
// ═══════════════════════════════════════════════════════════════════════════

interface Position {
  tokenAddress: string;
  tokenSymbol: string;
  entryPriceETH: bigint;        // Price per token at buy
  amountToken: bigint;           // Tokens held
  costBasisETH: bigint;          // Total ETH spent
  boughtAt: number;              // Timestamp
  tranchesSold: number;          // How many exit tranches executed
  totalSoldETH: bigint;          // Total ETH received from sells
  status: "active" | "exited" | "stopped"; 
}

const POSITION_STRATEGY = {
  // Buy amount per launch (conservative with $200 budget)
  buyAmountETH: parseEther("0.003"),    // ~$8-10 per position
  
  // Portfolio exposure limits
  maxActivePositions: 10,               // Max concurrent positions
  maxPortfolioExposure: 0.25,           // Never >25% of wallet in positions
  
  // Staged exit strategy - sell in tranches as price increases
  sellTranches: [
    { triggerMultiple: 3,  sellPercent: 25 },  // Sell 25% at 3x
    { triggerMultiple: 5,  sellPercent: 25 },  // Sell 25% at 5x
    { triggerMultiple: 10, sellPercent: 25 },  // Sell 25% at 10x
    { triggerMultiple: 20, sellPercent: 25 },  // Sell remaining at 20x
  ],
  
  // Risk management
  stopLossMultiple: 0.5,                // Sell all if drops 50%
  maxHoldDuration: 7 * 24 * 60 * 60 * 1000,  // 7 days max hold
};

const positionManagerContext = context({
  type: "position-manager",
  schema: z.object({
    buyAmountETH: z.string().default(POSITION_STRATEGY.buyAmountETH.toString()),
  }),
  create: () => ({
    activePositions: [] as Position[],
    closedPositions: [] as Position[],
    totalInvested: BigInt(0),
    totalReturned: BigInt(0),
  }),
})
  .use((state) => [{ context: launcherContext, args: state.args }])
  .setActions([
    action({
      name: "buyOwnToken",
      description: "Buy a position in a newly launched token immediately after launch",
      schema: z.object({
        tokenAddress: z.string(),
        tokenSymbol: z.string(),
        amountETH: z.string().optional(),
      }),
      handler: async ({ tokenAddress, tokenSymbol, amountETH }, ctx) => {
        const buyAmount = amountETH 
          ? parseEther(amountETH) 
          : POSITION_STRATEGY.buyAmountETH;
        
        // Safety: Check portfolio exposure
        const walletBalance = await publicClient.getBalance({ 
          address: walletClient.account.address 
        });
        const currentExposure = ctx.memory.activePositions.reduce(
          (sum, p) => sum + p.costBasisETH, BigInt(0)
        );
        
        if (currentExposure + buyAmount > (walletBalance * BigInt(25)) / BigInt(100)) {
          return { 
            success: false, 
            reason: "Portfolio exposure limit reached (25% of wallet)" 
          };
        }
        
        // Safety: Check max active positions
        if (ctx.memory.activePositions.length >= POSITION_STRATEGY.maxActivePositions) {
          return { 
            success: false, 
            reason: `Max active positions reached (${POSITION_STRATEGY.maxActivePositions})` 
          };
        }
        
        // Execute buy via Flaunch swap (ETH → token)
        const flaunchClient = createFlaunch({ publicClient, walletClient });
        const hash = await flaunchClient.swap({
          tokenAddress: tokenAddress as `0x${string}`,
          amountIn: buyAmount,
          direction: "buy",
          slippageBps: 500, // 5% slippage tolerance for new tokens
        });
        
        // Get tokens received from transaction receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const tokensReceived = parseSwapReceipt(receipt, tokenAddress);
        
        // Track position
        const position: Position = {
          tokenAddress,
          tokenSymbol,
          entryPriceETH: buyAmount / tokensReceived,
          amountToken: tokensReceived,
          costBasisETH: buyAmount,
          boughtAt: Date.now(),
          tranchesSold: 0,
          totalSoldETH: BigInt(0),
          status: "active",
        };
        
        ctx.memory.activePositions.push(position);
        ctx.memory.totalInvested += buyAmount;
        
        return { 
          success: true, 
          txHash: hash,
          tokensReceived: tokensReceived.toString(),
          costBasisETH: buyAmount.toString(),
        };
      },
    }),
    
    action({
      name: "monitorPositions",
      description: "Check all active positions for exit conditions (staged sells, stop loss, time expiry)",
      schema: z.object({}),
      handler: async (_, ctx) => {
        const results = [];
        
        for (const position of ctx.memory.activePositions) {
          if (position.status !== "active") continue;
          
          // Get current token price
          const currentPrice = await getTokenPriceETH(position.tokenAddress);
          const multiple = Number(currentPrice) / Number(position.entryPriceETH);
          const holdDuration = Date.now() - position.boughtAt;
          
          // ─── Check Stop Loss ───
          if (multiple <= POSITION_STRATEGY.stopLossMultiple) {
            const sellResult = await executeSell(position, 100);
            position.status = "stopped";
            position.totalSoldETH += sellResult.ethReceived;
            ctx.memory.totalReturned += sellResult.ethReceived;
            
            results.push({
              token: position.tokenSymbol,
              action: "STOP_LOSS",
              multiple: multiple.toFixed(2),
              ethReceived: sellResult.ethReceived.toString(),
            });
            continue;
          }
          
          // ─── Check Time-Based Exit ───
          if (holdDuration > POSITION_STRATEGY.maxHoldDuration) {
            const sellResult = await executeSell(position, 100);
            position.status = "exited";
            position.totalSoldETH += sellResult.ethReceived;
            ctx.memory.totalReturned += sellResult.ethReceived;
            
            results.push({
              token: position.tokenSymbol,
              action: "TIME_EXIT",
              multiple: multiple.toFixed(2),
              ethReceived: sellResult.ethReceived.toString(),
            });
            continue;
          }
          
          // ─── Check Staged Profit-Taking ───
          for (const tranche of POSITION_STRATEGY.sellTranches) {
            if (
              multiple >= tranche.triggerMultiple && 
              position.tranchesSold < tranche.sellPercent
            ) {
              const sellResult = await executeSell(position, tranche.sellPercent);
              position.tranchesSold += tranche.sellPercent;
              position.amountToken -= sellResult.tokensSold;
              position.totalSoldETH += sellResult.ethReceived;
              ctx.memory.totalReturned += sellResult.ethReceived;
              
              // If all tranches sold, mark as exited
              if (position.tranchesSold >= 100) {
                position.status = "exited";
              }
              
              results.push({
                token: position.tokenSymbol,
                action: `TAKE_PROFIT_${tranche.triggerMultiple}x`,
                multiple: multiple.toFixed(2),
                percentSold: tranche.sellPercent,
                ethReceived: sellResult.ethReceived.toString(),
              });
            }
          }
        }
        
        // Move fully exited positions to closed
        const exited = ctx.memory.activePositions.filter(
          p => p.status === "exited" || p.status === "stopped"
        );
        ctx.memory.closedPositions.push(...exited);
        ctx.memory.activePositions = ctx.memory.activePositions.filter(
          p => p.status === "active"
        );
        
        return { 
          checked: ctx.memory.activePositions.length + exited.length,
          exits: results,
          activePositions: ctx.memory.activePositions.length,
        };
      },
    }),
    
    action({
      name: "getPortfolioStatus",
      description: "Get current portfolio P&L summary",
      schema: z.object({}),
      handler: async (_, ctx) => {
        // Calculate unrealized P&L for active positions
        let unrealizedValueETH = BigInt(0);
        for (const position of ctx.memory.activePositions) {
          const currentPrice = await getTokenPriceETH(position.tokenAddress);
          unrealizedValueETH += currentPrice * position.amountToken;
        }
        
        const totalInvested = ctx.memory.totalInvested;
        const totalReturned = ctx.memory.totalReturned;
        const realizedPnL = totalReturned - totalInvested;
        
        return {
          activePositions: ctx.memory.activePositions.length,
          closedPositions: ctx.memory.closedPositions.length,
          totalInvestedETH: totalInvested.toString(),
          totalReturnedETH: totalReturned.toString(),
          unrealizedValueETH: unrealizedValueETH.toString(),
          realizedPnL: realizedPnL.toString(),
          totalPnL: (realizedPnL + unrealizedValueETH).toString(),
        };
      },
    }),
  ]);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR POSITION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function executeSell(
  position: Position, 
  percentToSell: number
): Promise<{ ethReceived: bigint; tokensSold: bigint }> {
  const tokensToSell = (position.amountToken * BigInt(percentToSell)) / BigInt(100);
  
  const flaunchClient = createFlaunch({ publicClient, walletClient });
  const hash = await flaunchClient.swap({
    tokenAddress: position.tokenAddress as `0x${string}`,
    amountIn: tokensToSell,
    direction: "sell",
    slippageBps: 500,
  });
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const ethReceived = parseSwapReceiptForETH(receipt);
  
  return { ethReceived, tokensSold: tokensToSell };
}

async function getTokenPriceETH(tokenAddress: string): Promise<bigint> {
  // Query Flaunch subgraph for current pool price
  const query = `
    query TokenPrice($token: String!) {
      pools(where: { memecoin_: { address: $token } }) {
        sqrtPriceX96
        tick
      }
    }
  `;
  const response = await fetch(FLAUNCH_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { token: tokenAddress.toLowerCase() } }),
  });
  const { data } = await response.json();
  return calculatePriceFromSqrtPriceX96(data.pools[0].sqrtPriceX96);
}
```

### 2. Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA INGESTION LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Flaunch    │    │   External   │    │   Social     │                   │
│  │   Subgraph   │    │   Token APIs │    │   Feeds      │                   │
│  │              │    │   (x402)     │    │   (x402)     │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                    MESSAGE QUEUE (Redis/BullMQ)              │           │
│  │  • token:new  • token:volume  • trend:social  • trend:price  │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                   PROCESSING WORKERS                          │           │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │           │
│  │  │ Normalize   │  │ Deduplicate │  │ Enrich      │           │           │
│  │  │ Data        │  │ & Filter    │  │ Metadata    │           │           │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                   DAYDREAMS MEMORY STORE                      │           │
│  │  • Context state persistence  • Historical patterns           │           │
│  │  • Launch performance tracking  • Budget allocation           │           │
│  └──────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Flaunch Subgraph Queries:**

```graphql
# Query for monitoring new launches
query NewLaunches($since: Int!, $minVolume: BigDecimal!) {
  pools(
    where: { 
      createdAt_gte: $since
      volumeETH_gte: $minVolume 
    }
    orderBy: createdAt
    orderDirection: desc
    first: 100
  ) {
    id
    memecoin {
      address
      symbol
      name
      totalSupply
    }
    volumeETH
    volumeUSD
    totalRevenue
    creatorFeeAllocation
    createdAt
    fairLaunchEndsAt
    tokenUri
    swaps(first: 100, orderBy: timestamp, orderDirection: desc) {
      type
      amountETH
      amountToken
      timestamp
    }
  }
}

# Query for trending tokens by velocity
query TrendingByVelocity($timeWindow: Int!) {
  pools(
    where: { createdAt_gte: $timeWindow }
    orderBy: volumeETH
    orderDirection: desc
    first: 20
  ) {
    id
    memecoin { symbol name }
    volumeETH
    swaps(first: 500) {
      timestamp
      type
    }
  }
}
```

### 3. x402 Payment Integration

The agent uses x402 for both paying for services (data APIs, image generation) and receiving revenue (future agent-as-service model).

```typescript
// packages/agent/src/x402/client.ts
import { createDreamsRouterAuth } from "@daydreamsai/ai-sdk-provider";
import { CdpWalletProvider } from "@coinbase/agentkit";

export async function initializeX402Client(walletProvider: CdpWalletProvider) {
  // Get the wallet client from CDP provider
  const walletClient = walletProvider.getWalletClient();
  
  // Initialize Dreams Router with x402 payments
  // CDP wallet signs payment transactions securely via TEE
  const { dreamsRouter } = await createDreamsRouterAuth(walletClient, {
    payments: {
      amount: "100000", // $0.10 in USDC (6 decimals)
      network: "base",
    },
  });
  
  return dreamsRouter;
}

// Middleware for x402 payment handling
export async function withX402Payment<T>(
  url: string,
  options: RequestInit,
  maxPayment: bigint
): Promise<T> {
  // Initial request
  let response = await fetch(url, options);
  
  // Check for 402 Payment Required
  if (response.status === 402) {
    const paymentRequired = response.headers.get("X-Payment-Required");
    const paymentDetails = JSON.parse(
      Buffer.from(paymentRequired!, "base64").toString()
    );
    
    // Verify payment is within budget
    if (BigInt(paymentDetails.amount) > maxPayment) {
      throw new Error(`Payment ${paymentDetails.amount} exceeds max ${maxPayment}`);
    }
    
    // Sign and create payment
    const paymentPayload = await createPaymentPayload(paymentDetails);
    
    // Retry with payment
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "X-Payment": paymentPayload,
      },
    });
  }
  
  return response.json();
}
```

### 4. ERC-8004 Agent Identity

Register the agent on-chain for discoverability and reputation tracking:

```typescript
// packages/agent/src/identity/erc8004.ts
import { 
  AgentRegistryABI, 
  AGENT_REGISTRY_ADDRESS 
} from "@daydreamsai/erc8004";

export async function registerAgent(
  walletClient: WalletClient,
  agentMetadata: AgentMetadata
) {
  // Create agent registration file (stored on IPFS)
  const registrationFile = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agentMetadata.name,
    description: agentMetadata.description,
    image: agentMetadata.imageUrl,
    services: [
      {
        name: "token-launcher",
        endpoint: agentMetadata.apiEndpoint,
      },
    ],
  };
  
  // Upload to IPFS
  const ipfsCid = await uploadToIPFS(registrationFile);
  
  // Register on-chain
  const hash = await walletClient.writeContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AgentRegistryABI,
    functionName: "register",
    args: [`ipfs://${ipfsCid}`],
  });
  
  return { hash, agentUri: `ipfs://${ipfsCid}` };
}

// Track reputation via feedback registry
export async function submitFeedback(
  publicClient: PublicClient,
  walletClient: WalletClient,
  agentId: bigint,
  feedback: {
    rating: number; // 1-5
    category: string;
    comment?: string;
  }
) {
  // ... interact with Reputation Registry
}
```

### 5. Decision Engine

The core intelligence that decides WHEN and WHAT to launch:

```typescript
// packages/agent/src/decision/engine.ts
import { z } from "zod";

const LaunchDecisionSchema = z.object({
  shouldLaunch: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedConcept: z.string().optional(),
  suggestedTiming: z.enum(["immediate", "wait_1h", "wait_peak_hours"]),
});

type LaunchDecision = z.infer<typeof LaunchDecisionSchema>;

export async function makeDecision(
  currentState: AgentState,
  marketConditions: MarketConditions
): Promise<LaunchDecision> {
  // Decision factors:
  const factors = {
    // 1. Budget constraints
    hasEnoughGas: currentState.ethBalance > parseEther("0.05"),
    hasEnoughUSDC: currentState.usdcBalance > parseUnits("10", 6),
    
    // 2. Recent performance
    recentSuccessRate: calculateRecentSuccessRate(currentState.launchedTokens),
    
    // 3. Market timing
    isHighActivity: marketConditions.hourlyVolume > VOLUME_THRESHOLD,
    isNotOversaturated: marketConditions.recentLaunches < SATURATION_THRESHOLD,
    
    // 4. Concept quality
    topConceptScore: currentState.scoredConcepts[0]?.score || 0,
    
    // 5. Cooldown (avoid rapid-fire launches)
    timeSinceLastLaunch: Date.now() - currentState.lastLaunchTimestamp,
    minCooldownMet: timeSinceLastLaunch > MIN_COOLDOWN_MS,
  };
  
  // Weighted decision matrix
  const score = 
    (factors.hasEnoughGas ? 0.15 : 0) +
    (factors.hasEnoughUSDC ? 0.1 : 0) +
    (factors.recentSuccessRate * 0.2) +
    (factors.isHighActivity ? 0.15 : 0) +
    (factors.isNotOversaturated ? 0.1 : 0) +
    (factors.topConceptScore * 0.2) +
    (factors.minCooldownMet ? 0.1 : 0);
    
  return {
    shouldLaunch: score > 0.65 && factors.hasEnoughGas && factors.minCooldownMet,
    confidence: score,
    reasoning: generateReasoning(factors),
    suggestedConcept: factors.topConceptScore > 0.7 
      ? currentState.scoredConcepts[0].concept 
      : undefined,
    suggestedTiming: determineOptimalTiming(marketConditions),
  };
}
```

---

## Deployment Architecture: Railway

### Why Railway?

For an autonomous agent that needs to run 24/7, Railway provides the best balance of simplicity, cost, and reliability:

| Consideration | Railway |
|---------------|---------|
| **Setup Time** | ~5 minutes |
| **Cost** | ~$5-20/month |
| **Uptime** | 99.9% SLA |
| **Auto-restart** | Yes, on crashes |
| **Logging** | Built-in |
| **Scaling** | One-click |
| **Redis** | One-click add-on |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEPLOYMENT TOPOLOGY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        RAILWAY (Agent Host)                          │   │
│   │                                                                       │   │
│   │   ┌─────────────────────────────────────────────────────────────┐    │   │
│   │   │              DAYDREAMS AGENT (Node.js Process)               │    │   │
│   │   │                                                               │    │   │
│   │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │    │   │
│   │   │  │  Monitor    │  │  Analyzer   │  │  Launcher   │          │    │   │
│   │   │  │  Context    │  │  Context    │  │  Context    │          │    │   │
│   │   │  └─────────────┘  └─────────────┘  └─────────────┘          │    │   │
│   │   │                                                               │    │   │
│   │   │  ┌───────────────────────────────────────────────────────┐  │    │   │
│   │   │  │           AUTONOMOUS EXECUTION LOOP                    │  │    │   │
│   │   │  │  Every 60s: Poll → Analyze → Decide → Launch → Buy    │  │    │   │
│   │   │  │  Every 60s: Monitor positions → Staged exits → Claim   │  │    │   │
│   │   │  └───────────────────────────────────────────────────────┘  │    │   │
│   │   └─────────────────────────────────────────────────────────────┘    │   │
│   │                                                                       │   │
│   │   ┌─────────────────┐  ┌─────────────────┐                           │   │
│   │   │     Redis       │  │    Postgres     │                           │   │
│   │   │   (optional)    │  │   (optional)    │                           │   │
│   │   │                 │  │                 │                           │   │
│   │   │ • State cache   │  │ • Launch hist   │                           │   │
│   │   │ • Rate limits   │  │ • Analytics     │                           │   │
│   │   │ • Queue locks   │  │ • Audit log     │                           │   │
│   │   └─────────────────┘  └─────────────────┘                           │   │
│   │                                                                       │   │
│   └───────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    CDP INFRASTRUCTURE                                │   │
│   │                                                                       │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │              SERVER WALLET v2 (AWS Nitro TEE)                │   │   │
│   │   │                                                               │   │   │
│   │   │  • Private keys NEVER leave TEE                              │   │   │
│   │   │  • API-based signing requests                                │   │   │
│   │   │  • Transaction batching & gas sponsorship available          │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                       │   │
│   └───────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        BASE NETWORK                                  │   │
│   │                                                                       │   │
│   │  • Flaunch Position Manager (launches)                               │   │
│   │  • Agent Wallet Address (fees accumulate here)                       │   │
│   │  • ERC-8004 Registry (agent identity)                                │   │
│   │                                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Railway Deployment Files

**Dockerfile:**
```dockerfile
# packages/agent/Dockerfile
FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript
RUN pnpm build

# Run agent
CMD ["node", "dist/runner.js"]
```

**railway.toml:**
```toml
[build]
builder = "dockerfile"
dockerfilePath = "packages/agent/Dockerfile"

[deploy]
startCommand = "node dist/runner.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "always"
restartPolicyMaxRetries = 10
```

**packages/agent/src/runner.ts:**
```typescript
// Autonomous execution loop for Railway deployment
import { createDreams } from "@daydreamsai/core";
import { initializeAgentWallet, createFlaunchClient } from "./wallet/provider";
import { monitorContext, analyzerContext, creatorContext, launcherContext, positionManagerContext } from "./contexts";
import { makeDecision } from "./decision/engine";
import { SAFETY_LIMITS, checkSafetyConditions } from "./safety";

async function main() {
  console.log("🚀 Starting Autonomous Token Launcher Agent...");
  
  // Initialize CDP wallet
  const { walletProvider } = await initializeAgentWallet();
  const address = await walletProvider.getAddress();
  console.log(`📍 Agent wallet: ${address}`);
  
  // Initialize Flaunch client
  const { flaunch, publicClient } = await createFlaunchClient(walletProvider);
  
  // Create Daydreams agent
  const agent = createDreams({
    model: openai("gpt-4o"),
    contexts: [monitorContext, analyzerContext, creatorContext, launcherContext, positionManagerContext],
  });
  
  // Main autonomous loop
  while (true) {
    const cycleStart = Date.now();
    
    try {
      // 1. Safety check
      const safety = await checkSafetyConditions(walletProvider, agent.state);
      if (!safety.safe) {
        console.log(`⚠️ Safety check failed: ${safety.reason}`);
        await sleep(SAFETY_LIMITS.minTimeBetweenLaunches);
        continue;
      }
      
      // 2. Monitor: Poll for new tokens
      console.log("👀 Polling Flaunch for new tokens...");
      await agent.send({
        context: monitorContext,
        input: "Poll for new tokens and extract trending concepts",
      });
      
      // 3. Analyze: Score concepts
      console.log("🧠 Analyzing trends...");
      await agent.send({
        context: analyzerContext,
        input: "Score trending concepts and identify best candidates",
      });
      
      // 4. Decide: Should we launch?
      const decision = await makeDecision(agent.state, await getMarketConditions());
      console.log(`📊 Decision: ${decision.shouldLaunch ? 'LAUNCH' : 'WAIT'} (confidence: ${decision.confidence.toFixed(2)})`);
      
      if (decision.shouldLaunch && decision.confidence > SAFETY_LIMITS.minConfidenceThreshold) {
        // 5. Create: Generate token metadata
        console.log(`🎨 Generating token for concept: ${decision.suggestedConcept}`);
        await agent.send({
          context: creatorContext,
          input: `Generate token for concept: ${decision.suggestedConcept}`,
        });
        
        // 6. Launch: Deploy to Flaunch
        console.log("🚀 Launching token...");
        const result = await agent.send({
          context: launcherContext,
          input: "Launch the prepared token",
        });
        
        console.log(`✅ Token launched! TX: ${result.txHash}`);
        
        // 7. Buy own token: Take a position immediately after launch
        if (result.tokenAddress) {
          console.log(`💎 Buying own token at ${result.tokenAddress}...`);
          const buyResult = await agent.send({
            context: positionManagerContext,
            input: `Buy position in newly launched token ${result.tokenAddress}`,
          });
          
          if (buyResult.success) {
            console.log(`✅ Position opened: ${buyResult.tokensReceived} tokens for ${buyResult.costBasisETH} ETH`);
          } else {
            console.log(`⚠️ Position skipped: ${buyResult.reason}`);
          }
        }
        
        // Enter cooldown
        console.log(`😴 Entering cooldown for ${SAFETY_LIMITS.minTimeBetweenLaunches / 1000 / 60} minutes`);
        await sleep(SAFETY_LIMITS.minTimeBetweenLaunches);
      }
      
      // 8. Monitor positions: Check exits on EVERY cycle (even non-launch cycles)
      console.log("📈 Monitoring active positions...");
      const positionResults = await agent.send({
        context: positionManagerContext,
        input: "Check all active positions for exit conditions",
      });
      
      if (positionResults.exits?.length > 0) {
        for (const exit of positionResults.exits) {
          console.log(`💰 ${exit.action}: $${exit.token} at ${exit.multiple}x → ${exit.ethReceived} ETH`);
          await sendAlert(
            `${exit.action}: $${exit.token} at ${exit.multiple}x → ${exit.ethReceived} ETH`,
            exit.action === "STOP_LOSS" ? "warning" : "info"
          );
        }
      }
      
      // 9. Claim fees periodically
      if (shouldClaimFees(agent.state)) {
        console.log("💰 Claiming accumulated fees...");
        await agent.send({
          context: launcherContext,
          input: "Claim fees from all launched tokens",
        });
      }
      
    } catch (error) {
      console.error("❌ Cycle error:", error);
      // Don't crash, just wait and retry
    }
    
    // Wait for next cycle (minimum 60 seconds)
    const elapsed = Date.now() - cycleStart;
    const waitTime = Math.max(60_000 - elapsed, 0);
    await sleep(waitTime);
  }
}

// Health check endpoint for Railway
import { createServer } from "http";
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("OK");
  }
}).listen(process.env.PORT || 3000);

// Start the agent
main().catch(console.error);
```

### Railway Setup Commands

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize project (from repo root)
railway init

# 4. Add environment variables
railway variables set CDP_API_KEY_NAME=your-key-name
railway variables set CDP_API_KEY_PRIVATE=your-private-key
railway variables set BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
railway variables set OPENAI_API_KEY=sk-...

# 5. Deploy
railway up

# 6. View logs
railway logs -f

# 7. (Optional) Add Redis for state caching
railway add redis
```

### Monitoring & Alerts

**Set up alerts via Railway + Discord/Slack webhook:**

```typescript
// packages/agent/src/alerts.ts
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function sendAlert(message: string, type: "info" | "warning" | "error") {
  if (!WEBHOOK_URL) return;
  
  const emoji = { info: "ℹ️", warning: "⚠️", error: "🚨" }[type];
  
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `${emoji} **Token Launcher Agent**\n${message}`,
    }),
  });
}

// Usage:
// await sendAlert(`Launched $${symbol} - TX: ${hash}`, "info");
// await sendAlert(`Low ETH balance: ${balance}`, "warning");
// await sendAlert(`Launch failed: ${error.message}`, "error");
```

---

## Security Architecture

### Wallet Security (CDP Server Wallet v2)

| Concern | Mitigation |
|---------|------------|
| **Private Key Exposure** | Keys never leave AWS Nitro TEE - not stored in code, env vars, or logs |
| **API Key Compromise** | API keys can be rotated; assets remain secure due to TEE architecture |
| **Railway Breach** | Attacker gets API keys but cannot sign without CDP infrastructure |
| **Man-in-the-Middle** | All CDP API calls over HTTPS with certificate pinning |

### Operational Security

| Concern | Mitigation |
|---------|------------|
| **Runaway Spending** | Hard-coded gas limits, daily caps, circuit breakers (see Safety Limits) |
| **Rug Perception** | ERC-8004 identity, transparent launch history, systematic equal-size buys |
| **Position Losses** | Stop loss at 50%, 7-day max hold, 25% portfolio exposure cap |
| **Front-running Optics** | Agent buys same amount on EVERY launch (systematic, not discretionary) |
| **API Rate Limits** | Exponential backoff, multiple RPC providers |
| **Subgraph Lag** | Fallback to direct contract reads for critical data |
| **Agent Downtime** | Railway auto-restart, Discord alerts on failures |

### Safety Limits Configuration

```typescript
// packages/agent/src/safety.ts
import { parseEther, parseUnits } from "viem";

export const SAFETY_LIMITS = {
  // Budget constraints
  maxDailyGasSpend: parseEther("0.5"),      // ~$1,500 at $3k ETH
  maxSingleLaunchGas: parseEther("0.02"),   // ~$60
  minEthBalance: parseEther("0.1"),          // Reserve buffer
  
  // Launch rate limiting
  maxLaunchesPerDay: 5,
  minTimeBetweenLaunches: 2 * 60 * 60 * 1000, // 2 hours
  
  // Quality thresholds
  minConceptScore: 0.65,
  minConfidenceThreshold: 0.7,
  
  // Position management
  maxBuyPerToken: parseEther("0.003"),       // ~$8-10 per position
  maxActivePositions: 10,                     // Max concurrent positions
  maxPortfolioExposure: 0.25,                // Never >25% of wallet in positions
  stopLossMultiple: 0.5,                     // Sell all if drops 50%
  maxHoldDays: 7,                            // Auto-exit after 7 days
  
  // Circuit breakers
  maxConsecutiveFailures: 3,
  pauseOnHighGas: 100, // gwei - pause if gas > 100 gwei
  
  // Emergency stop
  emergencyStopFile: "/tmp/agent-stop", // Touch this file to stop agent
};

export async function checkSafetyConditions(
  walletProvider: CdpWalletProvider,
  agentState: AgentState
): Promise<{ safe: boolean; reason?: string }> {
  // Check emergency stop file
  if (await fileExists(SAFETY_LIMITS.emergencyStopFile)) {
    return { safe: false, reason: "Emergency stop file detected" };
  }
  
  // Check ETH balance
  const balance = await walletProvider.getBalance();
  if (balance < SAFETY_LIMITS.minEthBalance) {
    return { safe: false, reason: `ETH balance too low: ${balance}` };
  }
  
  // Check daily gas spend
  const todaySpend = calculateTodayGasSpend(agentState);
  if (todaySpend > SAFETY_LIMITS.maxDailyGasSpend) {
    return { safe: false, reason: "Daily gas limit reached" };
  }
  
  // Check launches today
  const launchesToday = countLaunchesToday(agentState);
  if (launchesToday >= SAFETY_LIMITS.maxLaunchesPerDay) {
    return { safe: false, reason: "Daily launch limit reached" };
  }
  
  // Check consecutive failures
  if (agentState.consecutiveFailures >= SAFETY_LIMITS.maxConsecutiveFailures) {
    return { safe: false, reason: "Too many consecutive failures - manual review needed" };
  }
  
  // Check gas price
  const gasPrice = await getGasPrice();
  if (gasPrice > SAFETY_LIMITS.pauseOnHighGas * 1e9) {
    return { safe: false, reason: `Gas price too high: ${gasPrice / 1e9} gwei` };
  }
  
  return { safe: true };
}
```

---

## Cost Model

### Per-Launch Cost Breakdown

| Component | Estimated Cost | Notes |
|-----------|----------------|-------|
| Token launch (gas) | ~$2-5 | Base L2 is cheap |
| Position buy (gas) | ~$1 | Swap transaction fee |
| Position buy (capital) | ~$8-10 | 0.003 ETH per position |
| LLM calls | $0.01-0.10 | Concept + analysis |
| Image generation | $0.05-0.20 | Replicate/DALL-E |
| **Total per launch** | **~$12-17** | **Including position** |

### Fixed Monthly Costs

| Component | Estimated Cost | Notes |
|-----------|----------------|-------|
| CDP Server Wallet | Free | No per-transaction fees |
| Railway Hosting | $5-20/mo | Based on compute usage |
| RPC Calls | $0-50/mo | Alchemy/QuickNode |
| Redis (Railway) | $0-5/mo | Optional, small instance free |
| **Total fixed** | **~$10-75/mo** | |

### $200 Budget Allocation

```
Total Budget: $200 (in ETH)
├── Gas Reserve:         $50  (launch txns, swap txns, fee claims)
├── Position Capital:    $80  (8-10 positions at ~$8-10 each)
├── Operating Buffer:    $50  (absorb losses, extra launches)
└── Emergency Reserve:   $20  (never touched unless critical)

Expected Activity (30-day experiment):
├── Launches:            30-50 tokens
├── Positions taken:     30-50 (buy every token launched)
├── Position exits:      Via staged sells or stop loss
└── Fee claims:          Weekly batched claims
```

### Revenue Model (Dual Income)

```
STREAM 1: Meme Stream Fees (Passive)
  1% of all swap volume on launched tokens
  Paid in ETH, accumulates in Flaunch Position Manager
  Claim periodically via claimFees()

STREAM 2: Position Gains (Active)
  Buy ~$8-10 of each token at launch
  Staged exits at 3x, 5x, 10x, 20x
  Stop loss at 0.5x (lose max $5 per position)

Revenue Scenarios (30-day period):

Conservative (no hits):
  Fees:      $20 (low volume across 40 tokens)
  Positions: -$100 (most stop-loss or expire worthless)
  Net:       -$80

Moderate (2-3 mid-performers):
  Fees:      $150 (2 tokens with $5k/day volume)
  Positions: +$50 (2 tokens hit 5x, rest stop-loss)
  Net:       +$200

Bull Case (1 runner):
  Fees:      $500+ (1 token with $50k+ volume)
  Positions: +$300 (1 token hits 20x = $8 → $160)
  Net:       +$800+
```

### Break-Even Analysis

```
To recover $200 investment:
  Via fees alone:     Need ~$20k total volume across all tokens
  Via positions alone: Need 1 token to hit ~25x on an $8 buy
  Via combination:     Need ~$10k volume + 1 token at ~10x

Key insight: The position strategy captures outsized upside
from tail events that fees alone would miss on mid-tier tokens.
```

---

## Implementation Roadmap

### Phase 1: MVP (2-3 weeks)
- [ ] Set up CDP account and generate API keys
- [ ] Initialize CDP Server Wallet v2 via AgentKit
- [ ] Basic Daydreams agent with monitor + launcher contexts
- [ ] Flaunch SDK integration for programmatic launches
- [ ] Simple trend detection (volume-based)
- [ ] Position manager: buy own token at launch
- [ ] Position manager: stop loss and time-based exits
- [ ] Manual trigger via CLI for testing
- [ ] Deploy to Railway (testnet first)

### Phase 2: Intelligence (2-3 weeks)
- [ ] LLM-powered concept generation
- [ ] Image generation pipeline (Replicate or similar)
- [ ] Scoring engine with multiple factors
- [ ] Decision engine with timing optimization
- [ ] Position manager: staged profit-taking exits
- [ ] Add safety limits and circuit breakers
- [ ] Portfolio P&L tracking and reporting

### Phase 3: Autonomy (2-3 weeks)
- [ ] Full autonomous loop in production
- [ ] x402 payment integration
- [ ] ERC-8004 agent registration
- [ ] Revenue tracking: fees + position gains
- [ ] Discord/Slack alerting (launches, exits, P&L)

### Phase 4: Optimization (Ongoing)
- [ ] A/B test different iteration strategies
- [ ] Tune scoring weights based on performance
- [ ] Tune position sizing based on concept score
- [ ] Add social signal integration (Twitter/Farcaster)
- [ ] Consider agent-as-a-service model
- [ ] Add Privy policy engine for additional controls (optional)

---

## Key Files & Structure

```
autonomous-token-launcher/
├── packages/
│   ├── agent/
│   │   ├── src/
│   │   │   ├── contexts/
│   │   │   │   ├── monitor.ts           # Polls Flaunch subgraph
│   │   │   │   ├── analyzer.ts          # Scores trending concepts
│   │   │   │   ├── creator.ts           # Generates token metadata
│   │   │   │   ├── launcher.ts          # Executes Flaunch SDK calls
│   │   │   │   └── position-manager.ts  # Buys own tokens, manages exits
│   │   │   ├── decision/
│   │   │   │   └── engine.ts            # Launch decision logic
│   │   │   ├── wallet/
│   │   │   │   └── provider.ts          # CDP AgentKit wallet setup
│   │   │   ├── x402/
│   │   │   │   └── client.ts            # x402 payment middleware
│   │   │   ├── identity/
│   │   │   │   └── erc8004.ts           # Agent registration
│   │   │   ├── safety.ts                # Safety limits & checks
│   │   │   ├── alerts.ts                # Discord/Slack webhooks
│   │   │   ├── runner.ts                # Autonomous loop entry point
│   │   │   └── index.ts                 # Agent initialization
│   │   ├── Dockerfile
│   │   ├── railway.toml
│   │   └── package.json
│   └── dashboard/                        # Optional monitoring UI
│       └── ... (Next.js app)
├── .env.example
├── docker-compose.yml                   # Local development
└── README.md
```

---

## Next Steps

### 1. Set Up CDP (5 minutes)
```bash
# Create account at https://portal.cdp.coinbase.com
# Generate API keys → save CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE
```

### 2. Initialize Project
```bash
# Clone Daydreams starter
npx create-daydreams-agent token-launcher
cd token-launcher

# Install dependencies
pnpm add @coinbase/agentkit @flaunch/sdk viem
```

### 3. Configure Environment
```bash
# Copy .env.example to .env.local
cp .env.example .env.local

# Add your keys:
# CDP_API_KEY_NAME=...
# CDP_API_KEY_PRIVATE=...
# BASE_RPC_URL=...
# OPENAI_API_KEY=...
```

### 4. Test Wallet Connection
```typescript
// scripts/test-wallet.ts
import { initializeAgentWallet } from "./src/wallet/provider";

const { walletProvider } = await initializeAgentWallet();
const address = await walletProvider.getAddress();
console.log(`Agent wallet: ${address}`);
// Fund this address with testnet ETH for testing
```

### 5. Deploy to Railway
```bash
# Install CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Set environment variables
railway variables set CDP_API_KEY_NAME=...
railway variables set CDP_API_KEY_PRIVATE=...
# ... other vars

# Deploy
railway up

# Watch logs
railway logs -f
```

### 6. Fund Agent Wallet
Send ETH to your agent's wallet address on Base Sepolia (testnet) or Base Mainnet (production).

---

## Reference Links

- **CDP Portal**: https://portal.cdp.coinbase.com
- **AgentKit Docs**: https://docs.cdp.coinbase.com/agent-kit/welcome
- **Server Wallet v2**: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
- **Flaunch SDK**: https://github.com/flayerlabs/flaunch-sdk
- **Flaunch Docs**: https://docs.flaunch.gg
- **Daydreams AI**: https://docs.dreams.fun
- **x402 Protocol**: https://docs.cdp.coinbase.com/x402/welcome
- **ERC-8004**: https://eips.ethereum.org/EIPS/eip-8004
- **Railway**: https://railway.app

---

Ready to build? Start with Step 1: Set Up CDP! 🚀
