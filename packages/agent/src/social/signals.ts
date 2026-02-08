import { SOCIAL_CONFIG } from "../constants.js";
import {
  fetchFarcasterSignals,
  normalizeFarcasterScore,
  type FarcasterConfig,
  type FarcasterSignal,
} from "./farcaster.js";
import {
  fetchTwitterSignals,
  normalizeTwitterScore,
  type TwitterConfig,
  type TwitterSignal,
} from "./twitter.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SocialSignalDetails {
  score: number;
  farcaster?: { signal: FarcasterSignal; normalizedScore: number };
  twitter?: { signal: TwitterSignal; normalizedScore: number };
  cachedAt?: number;
}

export interface SocialSignalProvider {
  getScore: (concept: string) => Promise<number>;
  getDetails: (concept: string) => Promise<SocialSignalDetails>;
  clearCache: () => void;
}

export interface SocialSignalConfig {
  farcaster?: FarcasterConfig;
  twitter?: TwitterConfig;
  cacheTTLMs?: number;
  farcasterWeight?: number;
  twitterWeight?: number;
  defaultScore?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createSocialSignalProvider(
  config: SocialSignalConfig
): SocialSignalProvider {
  const cache = new Map<string, { details: SocialSignalDetails; cachedAt: number }>();
  const cacheTTL = config.cacheTTLMs ?? SOCIAL_CONFIG.cacheTTLMs;
  const defaultScore = config.defaultScore ?? SOCIAL_CONFIG.defaultScore;

  const hasFarcaster = !!config.farcaster;
  const hasTwitter = !!config.twitter;

  // If neither API is configured, return neutral scores
  if (!hasFarcaster && !hasTwitter) {
    return {
      getScore: async () => defaultScore,
      getDetails: async () => ({ score: defaultScore }),
      clearCache: () => {},
    };
  }

  // Determine weights based on which APIs are available
  let farcasterWeight: number;
  let twitterWeight: number;

  if (hasFarcaster && hasTwitter) {
    farcasterWeight = config.farcasterWeight ?? SOCIAL_CONFIG.farcasterWeight;
    twitterWeight = config.twitterWeight ?? SOCIAL_CONFIG.twitterWeight;
  } else if (hasFarcaster) {
    farcasterWeight = 1.0;
    twitterWeight = 0;
  } else {
    farcasterWeight = 0;
    twitterWeight = 1.0;
  }

  async function fetchDetails(concept: string): Promise<SocialSignalDetails> {
    const details: SocialSignalDetails = { score: 0 };
    let fcScore = 0;
    let twScore = 0;

    // Fetch from available APIs in parallel
    const promises: Promise<void>[] = [];

    if (hasFarcaster && config.farcaster) {
      promises.push(
        fetchFarcasterSignals(concept, config.farcaster)
          .then((signal) => {
            const normalizedScore = normalizeFarcasterScore(signal);
            details.farcaster = { signal, normalizedScore };
            fcScore = normalizedScore;
          })
          .catch((err) => {
            console.warn(`[Social] Farcaster fetch failed for "${concept}":`, err);
            fcScore = defaultScore;
          })
      );
    }

    if (hasTwitter && config.twitter) {
      promises.push(
        fetchTwitterSignals(concept, config.twitter)
          .then((signal) => {
            const normalizedScore = normalizeTwitterScore(signal);
            details.twitter = { signal, normalizedScore };
            twScore = normalizedScore;
          })
          .catch((err) => {
            console.warn(`[Social] Twitter fetch failed for "${concept}":`, err);
            twScore = defaultScore;
          })
      );
    }

    await Promise.all(promises);

    // Weighted combination
    details.score = fcScore * farcasterWeight + twScore * twitterWeight;
    details.cachedAt = Date.now();

    return details;
  }

  async function getDetails(concept: string): Promise<SocialSignalDetails> {
    const key = concept.toLowerCase();
    const cached = cache.get(key);

    if (cached && Date.now() - cached.cachedAt < cacheTTL) {
      return cached.details;
    }

    const details = await fetchDetails(concept);
    cache.set(key, { details, cachedAt: Date.now() });
    return details;
  }

  return {
    getScore: async (concept: string) => {
      const details = await getDetails(concept);
      return details.score;
    },
    getDetails,
    clearCache: () => cache.clear(),
  };
}
