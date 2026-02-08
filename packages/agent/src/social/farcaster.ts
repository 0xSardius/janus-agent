import { SOCIAL_CONFIG } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FarcasterSignal {
  castCount: number;
  totalLikes: number;
  totalRecasts: number;
  totalReplies: number;
  uniqueAuthors: number;
  queriedAt: number;
}

export interface FarcasterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof globalThis.fetch;
}

interface NeynarCast {
  reactions: { likes_count?: number; recasts_count?: number };
  replies: { count?: number };
  author: { fid: number };
}

interface NeynarSearchResponse {
  result?: { casts?: NeynarCast[] };
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchFarcasterSignals(
  concept: string,
  config: FarcasterConfig
): Promise<FarcasterSignal> {
  const baseUrl = config.baseUrl || SOCIAL_CONFIG.farcasterBaseUrl;
  const fetchFn = config.fetchFn || globalThis.fetch;

  const url = `${baseUrl}/farcaster/cast/search?q=${encodeURIComponent(concept)}&limit=25`;

  const response = await fetchFn(url, {
    headers: {
      accept: "application/json",
      api_key: config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Neynar API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as NeynarSearchResponse;
  const casts = data.result?.casts || [];

  const authors = new Set<number>();
  let totalLikes = 0;
  let totalRecasts = 0;
  let totalReplies = 0;

  for (const cast of casts) {
    totalLikes += cast.reactions?.likes_count || 0;
    totalRecasts += cast.reactions?.recasts_count || 0;
    totalReplies += cast.replies?.count || 0;
    authors.add(cast.author.fid);
  }

  return {
    castCount: casts.length,
    totalLikes,
    totalRecasts,
    totalReplies,
    uniqueAuthors: authors.size,
    queriedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE SCORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize Farcaster engagement to a 0-1 score using log scaling.
 * - 0 engagement = 0.1
 * - ~50 total engagement = 0.5
 * - ~500+ total engagement = 1.0
 */
export function normalizeFarcasterScore(signal: FarcasterSignal): number {
  const totalEngagement =
    signal.castCount +
    signal.totalLikes * 2 +
    signal.totalRecasts * 3 +
    signal.totalReplies;

  if (totalEngagement === 0) return 0.1;

  // Log-scaled: log10(engagement) / log10(500) capped at 1.0
  const score = Math.log10(totalEngagement + 1) / Math.log10(500);
  return Math.min(1, Math.max(0.1, score));
}
