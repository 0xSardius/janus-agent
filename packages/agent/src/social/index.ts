export {
  fetchFarcasterSignals,
  normalizeFarcasterScore,
  type FarcasterSignal,
  type FarcasterConfig,
} from "./farcaster.js";

export {
  fetchTwitterSignals,
  normalizeTwitterScore,
  type TwitterSignal,
  type TwitterConfig,
} from "./twitter.js";

export {
  createSocialSignalProvider,
  type SocialSignalProvider,
  type SocialSignalDetails,
  type SocialSignalConfig,
} from "./signals.js";
