import { SOCIAL_CONFIG } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TwitterSignal {
  tweetCount: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  queriedAt: number;
}

export interface TwitterConfig {
  bearerToken: string;
  baseUrl?: string;
  fetchFn?: typeof globalThis.fetch;
}

interface TwitterTweet {
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
  };
}

interface TwitterSearchResponse {
  data?: TwitterTweet[];
  meta?: { result_count?: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchTwitterSignals(
  concept: string,
  config: TwitterConfig
): Promise<TwitterSignal> {
  const baseUrl = config.baseUrl || SOCIAL_CONFIG.twitterBaseUrl;
  const fetchFn = config.fetchFn || globalThis.fetch;

  const query = `${concept} crypto -is:retweet`;
  const url = `${baseUrl}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=25&tweet.fields=public_metrics`;

  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TwitterSearchResponse;
  const tweets = data.data || [];

  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;

  for (const tweet of tweets) {
    totalLikes += tweet.public_metrics?.like_count || 0;
    totalRetweets += tweet.public_metrics?.retweet_count || 0;
    totalReplies += tweet.public_metrics?.reply_count || 0;
  }

  return {
    tweetCount: tweets.length,
    totalLikes,
    totalRetweets,
    totalReplies,
    queriedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE SCORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize Twitter engagement to a 0-1 score using log scaling.
 * Similar curve to Farcaster but with different weight for retweets.
 */
export function normalizeTwitterScore(signal: TwitterSignal): number {
  const totalEngagement =
    signal.tweetCount +
    signal.totalLikes * 2 +
    signal.totalRetweets * 3 +
    signal.totalReplies;

  if (totalEngagement === 0) return 0.1;

  const score = Math.log10(totalEngagement + 1) / Math.log10(500);
  return Math.min(1, Math.max(0.1, score));
}
