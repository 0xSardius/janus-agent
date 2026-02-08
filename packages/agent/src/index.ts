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
