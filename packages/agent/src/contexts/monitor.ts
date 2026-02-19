import { z } from "zod";
import type { PoolData, TokenData, SubgraphPool } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR CONTEXT STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface MonitorState {
  lastPollTimestamp: number;
  recentTokens: PoolData[];
  trendingConcepts: string[];
  seenTokenIds: Set<string>;
}

export function createMonitorState(): MonitorState {
  return {
    lastPollTimestamp: 0,
    recentTokens: [],
    trendingConcepts: [],
    seenTokenIds: new Set(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBGRAPH QUERIES
// ═══════════════════════════════════════════════════════════════════════════

const RECENT_TOKENS_QUERY = `
  query RecentTokens($since: BigInt!, $minVolume: BigInt!) {
    pools(
      where: {
        liveAtTimestamp_gte: $since
        volumeETH_gte: $minVolume
      }
      orderBy: volumeETH
      orderDirection: desc
      first: 50
    ) {
      id
      collectionToken {
        id
        name
        symbol
        createdAt
        volumeETH
        totalFeesETH
        baseURI
        fairLaunch {
          ends_at
        }
      }
      volumeETH
      volumeUSDC
      totalFeesETH
      feeAllocation {
        creator
        community
      }
      liveAtTimestamp
    }
  }
`;

const TRENDING_TOKENS_QUERY = `
  query TrendingByVelocity($timeWindow: BigInt!) {
    pools(
      where: { liveAtTimestamp_gte: $timeWindow }
      orderBy: volumeETH
      orderDirection: desc
      first: 20
    ) {
      id
      collectionToken {
        id
        name
        symbol
        createdAt
        volumeETH
        totalFeesETH
        fairLaunch {
          ends_at
        }
      }
      volumeETH
      volumeUSDC
      liveAtTimestamp
    }
  }
`;

/**
 * Map subgraph pool data to our internal PoolData format
 */
function mapSubgraphPool(raw: SubgraphPool): PoolData {
  return {
    id: raw.id,
    memecoin: {
      address: raw.collectionToken.id,
      symbol: raw.collectionToken.symbol,
      name: raw.collectionToken.name,
    },
    volumeETH: raw.volumeETH,
    volumeUSD: raw.volumeUSDC,
    totalRevenue: raw.totalFeesETH,
    creatorFeeAllocation: raw.feeAllocation
      ? String(raw.feeAllocation.creator)
      : undefined,
    createdAt: Number(raw.liveAtTimestamp),
    fairLaunchEndsAt: raw.collectionToken.fairLaunch
      ? Number(raw.collectionToken.fairLaunch.ends_at)
      : undefined,
    tokenUri: raw.collectionToken.baseURI,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBGRAPH CLIENT
// ═══════════════════════════════════════════════════════════════════════════

async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const subgraphUrl = process.env.FLAUNCH_SUBGRAPH_URL;
  if (!subgraphUrl) {
    throw new Error("FLAUNCH_SUBGRAPH_URL not set");
  }

  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph query failed: ${response.statusText}`);
  }

  const json = await response.json() as { data?: T; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Subgraph query error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PollResult {
  tokensFound: number;
  newTokens: number;
  tokens: PoolData[];
}

/**
 * Poll Flaunch subgraph for new tokens launched since a given timestamp
 */
export async function pollNewTokens(
  state: MonitorState,
  since?: number,
  minVolumeETH: string = "0.01"
): Promise<PollResult> {
  // Always look back 24 hours to catch tokens that gained volume since launch
  const pollSince = since || Math.floor(Date.now() / 1000) - 86400;

  const data = await querySubgraph<{ pools: SubgraphPool[] }>(RECENT_TOKENS_QUERY, {
    since: String(pollSince),
    minVolume: String(Math.floor(parseFloat(minVolumeETH) * 1e18)),
  });

  const pools = (data.pools || []).map(mapSubgraphPool);

  // Track new vs seen tokens
  let newTokens = 0;
  for (const pool of pools) {
    if (!state.seenTokenIds.has(pool.id)) {
      state.seenTokenIds.add(pool.id);
      newTokens++;
    }
  }

  // Update state
  state.recentTokens = pools;
  state.lastPollTimestamp = Math.floor(Date.now() / 1000);

  return {
    tokensFound: pools.length,
    newTokens,
    tokens: pools,
  };
}

/**
 * Poll for trending tokens based on volume velocity
 */
export async function pollTrendingTokens(
  hoursBack: number = 6
): Promise<PoolData[]> {
  const timeWindow = Math.floor(Date.now() / 1000) - hoursBack * 3600;

  const data = await querySubgraph<{ pools: SubgraphPool[] }>(TRENDING_TOKENS_QUERY, {
    timeWindow: String(timeWindow),
  });

  return (data.pools || []).map(mapSubgraphPool);
}

/**
 * Extract trending concept keywords from recent successful tokens
 */
export async function extractTrendingConcepts(
  state: MonitorState
): Promise<string[]> {
  const tokens = state.recentTokens;
  if (tokens.length === 0) return [];

  // Extract name/symbol patterns from high-volume tokens
  const concepts: Map<string, number> = new Map();

  for (const pool of tokens) {
    const { symbol, name } = pool.memecoin;
    const volume = parseFloat(pool.volumeETH);

    // Weight by volume
    const weight = Math.log10(volume + 1);

    // Extract words from name
    const words = name.toLowerCase().split(/[\s_-]+/);
    for (const word of words) {
      if (word.length >= 3 && !isCommonWord(word)) {
        concepts.set(word, (concepts.get(word) || 0) + weight);
      }
    }

    // Add symbol as a concept
    const symbolLower = symbol.toLowerCase();
    if (symbolLower.length >= 2) {
      concepts.set(symbolLower, (concepts.get(symbolLower) || 0) + weight * 1.5);
    }
  }

  // Sort by score and return top concepts
  const sorted = Array.from(concepts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([concept]) => concept);

  state.trendingConcepts = sorted;
  return sorted;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const COMMON_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "way", "who", "boy",
  "did", "coin", "token", "meme", "crypto", "based", "base",
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase());
}

/**
 * Calculate volume velocity (volume / time since launch)
 */
export function calculateVolumeVelocity(pool: PoolData): number {
  const volumeETH = parseFloat(pool.volumeETH);
  const ageHours = (Date.now() / 1000 - pool.createdAt) / 3600;
  if (ageHours < 0.1) return volumeETH * 10; // Very new tokens get boost
  return volumeETH / ageHours;
}

/**
 * Filter pools by minimum requirements
 */
export function filterViablePools(
  pools: PoolData[],
  minVolumeETH: number = 0.1,
  maxAgeHours: number = 48
): PoolData[] {
  const now = Date.now() / 1000;
  return pools.filter((pool) => {
    const volume = parseFloat(pool.volumeETH);
    const ageHours = (now - pool.createdAt) / 3600;
    return volume >= minVolumeETH && ageHours <= maxAgeHours;
  });
}
