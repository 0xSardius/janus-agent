import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN & POOL DATA
// ═══════════════════════════════════════════════════════════════════════════

export const TokenDataSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  totalSupply: z.string().optional(),
});

export const SwapDataSchema = z.object({
  type: z.enum(["buy", "sell"]),
  amountETH: z.string(),
  amountToken: z.string(),
  timestamp: z.number(),
});

export const PoolDataSchema = z.object({
  id: z.string(),
  memecoin: TokenDataSchema,
  volumeETH: z.string(),
  volumeUSD: z.string().optional(),
  totalRevenue: z.string().optional(),
  creatorFeeAllocation: z.string().optional(),
  createdAt: z.number(),
  fairLaunchEndsAt: z.number().optional(),
  tokenUri: z.string().optional(),
  swaps: z.array(SwapDataSchema).optional(),
});

export type TokenData = z.infer<typeof TokenDataSchema>;
export type SwapData = z.infer<typeof SwapDataSchema>;
export type PoolData = z.infer<typeof PoolDataSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// SCORED CONCEPTS & LAUNCH CANDIDATES
// ═══════════════════════════════════════════════════════════════════════════

export const ScoredConceptSchema = z.object({
  concept: z.string(),
  score: z.number().min(0).max(1),
  factors: z.object({
    volumeScore: z.number(),
    recencyScore: z.number(),
    socialScore: z.number(),
    noveltyScore: z.number(),
  }).optional(),
});

export const LaunchCandidateSchema = z.object({
  concept: z.string(),
  selectedAt: z.number(),
  score: z.number(),
});

export type ScoredConcept = z.infer<typeof ScoredConceptSchema>;
export type LaunchCandidate = z.infer<typeof LaunchCandidateSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN METADATA (for generation)
// ═══════════════════════════════════════════════════════════════════════════

export const TokenMetadataSchema = z.object({
  name: z.string(),
  symbol: z.string().max(6),
  description: z.string(),
  base64Image: z.string().optional(),
  style: z.enum(["meme", "abstract", "mascot", "logo"]).default("meme"),
});

export type TokenMetadata = z.infer<typeof TokenMetadataSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCHED TOKEN
// ═══════════════════════════════════════════════════════════════════════════

export const LaunchedTokenSchema = z.object({
  address: z.string(),
  tokenId: z.bigint(),
  name: z.string(),
  symbol: z.string(),
  launchedAt: z.number(),
  txHash: z.string(),
  poolId: z.string().optional(),
});

export type LaunchedToken = z.infer<typeof LaunchedTokenSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// POSITION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const PositionStatusSchema = z.enum(["active", "exited", "stopped"]);

export const PositionSchema = z.object({
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  entryPriceETH: z.bigint(),
  amountToken: z.bigint(),
  costBasisETH: z.bigint(),
  boughtAt: z.number(),
  tranchesSold: z.number(),
  totalSoldETH: z.bigint(),
  status: PositionStatusSchema,
});

export type PositionStatus = z.infer<typeof PositionStatusSchema>;
export type Position = z.infer<typeof PositionSchema>;

export interface PositionExitResult {
  token: string;
  action: string;
  multiple: string;
  percentSold?: number;
  ethReceived: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketConditions {
  hourlyVolume: bigint;
  recentLaunches: number;
  gasPrice: bigint;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentState {
  ethBalance: bigint;
  usdcBalance: bigint;
  launchedTokens: LaunchedToken[];
  scoredConcepts: ScoredConcept[];
  lastLaunchTimestamp: number;
  consecutiveFailures: number;
  dailyGasSpent: bigint;
  todayLaunchCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const LaunchDecisionSchema = z.object({
  shouldLaunch: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedConcept: z.string().optional(),
  suggestedTiming: z.enum(["immediate", "wait_1h", "wait_peak_hours"]),
});

export type LaunchDecision = z.infer<typeof LaunchDecisionSchema>;
