// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Monitor Context - Polls Flaunch subgraph for new tokens
export {
  type MonitorState,
  createMonitorState,
  pollNewTokens,
  pollTrendingTokens,
  extractTrendingConcepts,
  calculateVolumeVelocity,
  filterViablePools,
} from "./monitor.js";

// Analyzer Context - Scores trending concepts
export {
  type AnalyzerState,
  createAnalyzerState,
  scoreConcept,
  scoreConcepts,
  selectLaunchCandidate,
  getNextCandidate,
  recordPerformance,
  fetchSocialSignals,
  analyzeConceptWithLLM,
} from "./analyzer.js";

// Creator Context - Generates token metadata (LLM + Image powered)
export {
  type CreatorState,
  type IterationType,
  type GenerationConfig,
  createCreatorState,
  generateTokenConcept,
  generateImage,
  regenerateImage,
  getNextPendingToken,
  peekNextPendingToken,
  clearPendingTokens,
  getPendingCount,
  getRecentGenerations,
  getUsedConcepts,
  generateTokenConceptFallback,
} from "./creator.js";

// Launcher Context - Executes Flaunch SDK launches
export {
  type LauncherState,
  type LaunchConfig,
  type LaunchResult,
  createLauncherState,
  launchToken,
  claimRevenue,
  claimAllRevenue,
  getLaunchedTokens,
  canLaunch,
  resetDailyCounters,
} from "./launcher.js";

// Position Manager Context - Buys own tokens, manages exits
export {
  type PositionManagerState,
  type BuyResult,
  type MonitorResult,
  type PortfolioStatus,
  createPositionManagerState,
  buyOwnToken,
  monitorPositions,
  getPortfolioStatus,
} from "./position-manager.js";
