// ═══════════════════════════════════════════════════════════════════════════
// JANUS AGENT - Autonomous Token Launcher
// ═══════════════════════════════════════════════════════════════════════════

// Types
export * from "./types.js";

// Constants
export * from "./constants.js";

// AI (LLM + Image Generation)
export {
  getModel,
  extractConceptsFromTokens,
  analyzeConceptPotential,
  generateText_,
  TokenConceptSchema,
  ExtractedConceptsSchema,
  ConceptAnalysisSchema,
  type TokenConcept,
  type ExtractedConcepts,
  type ConceptAnalysis,
  generateTokenImage,
  generateTokenLogo,
  generateMemeImage,
  imageUrlToBase64,
  generateImageVariations,
  type ImageGenerationOptions,
  type GeneratedImage,
} from "./ai/index.js";

// Wallet
export {
  initializeAgentWallet,
  createViemClients,
  createFlaunchClient,
  getWalletStatus,
  getWalletBalance,
  testWalletConnection,
} from "./wallet/provider.js";

// Wallet Funding Guide
export {
  checkWalletReadiness,
  estimateRequiredFunding,
  type WalletReadinessReport,
  type FundingEstimate,
} from "./wallet/funding-guide.js";

// Contexts
export * from "./contexts/index.js";

// Decision Engine
export { makeDecision, getMarketConditions } from "./decision/engine.js";

// Safety
export {
  checkSafetyConditions,
  calculateTodayGasSpend,
  countLaunchesToday,
  canLaunchNow,
  isWithinPortfolioLimit,
} from "./safety.js";

// Alerts
export {
  sendAlert,
  sendDiscordAlert,
  sendSlackAlert,
  alertLaunchSuccess,
  alertPositionOpened,
  alertPositionExit,
  alertLowBalance,
  alertError,
  alertX402Payment,
  alertIdentityRegistered,
  alertWalletFunded,
  alertShutdown,
} from "./alerts.js";

// x402 Micropayments
export {
  type X402ClientConfig,
  type X402Client,
  type WalletProviderSigner,
  createClientEvmSigner,
  createX402Fetch,
  SpendTracker,
} from "./x402/index.js";

// ERC-8004 Identity
export {
  type IdentityConfig,
  type AgentRegistrationInfo,
  getExistingIdentity,
  registerAgentIdentity,
  updateAgentURI,
  generateAgentRegistrationJSON,
  getRegistryAddress,
  IDENTITY_REGISTRY_ABI,
} from "./identity/index.js";

// Social Signals
export {
  createSocialSignalProvider,
  fetchFarcasterSignals,
  normalizeFarcasterScore,
  fetchTwitterSignals,
  normalizeTwitterScore,
  type SocialSignalProvider,
  type SocialSignalConfig,
  type SocialSignalDetails,
  type FarcasterSignal,
  type FarcasterConfig,
  type TwitterSignal,
  type TwitterConfig,
} from "./social/index.js";

// Performance Tracking
export {
  createPerformanceState,
  calculatePerformanceScore,
  categorizeConcept,
  recordPositionPerformance,
  getRecentSuccessRate,
  shouldTune,
  calculateWeightAdjustments,
  normalizeWeights,
  type PerformanceState,
  type PerformanceResult,
  type CategoryPerformance,
  type ScoringWeights,
  type TunerConfig,
  type TuneResult,
} from "./performance/index.js";

// API Server
export {
  createApiServer,
  verifyX402Payment,
  send402Response,
  handleTrends,
  handleScoreConcept,
  handlePortfolio,
  handlePerformance,
  type ApiServerConfig,
  type ApiContext,
  type X402GatingConfig,
} from "./api/index.js";

// Persistence (SQLite)
export {
  initDatabase,
  closeDatabase,
  type PositionRow,
  type LaunchedTokenRow,
  type PerformanceResultRow,
  type CategoryPerformanceRow,
  type ScoringWeightsRow,
  type GasRecordRow,
} from "./persistence/index.js";

export {
  hydrateFromDatabase,
  persistPosition,
  persistLaunchResult,
  persistPerformanceResult,
  persistCategoryPerformance,
  persistFactorCorrelations,
  persistWeights,
  persistMeta,
  persistGasRecord,
  type HydrationTarget,
  type HydrationResult,
} from "./persistence/index.js";

// Utils
export {
  withRetry,
  GasTracker,
  estimateGasFromReceipt,
  type RetryOptions,
  type GasRecord,
} from "./utils/index.js";

// Flaunch SDK Wrapper
export {
  createFlaunchWrapper,
  parseSwapReceiptForTokens,
  parseSwapReceiptForETH,
  type FlaunchClient,
} from "./flaunch/index.js";
