import { createServer, type Server } from "http";
import { initializeAgentWallet, createFlaunchClient } from "./wallet/provider.js";
import { checkWalletReadiness, estimateRequiredFunding } from "./wallet/funding-guide.js";
import {
  createMonitorState,
  createAnalyzerState,
  createCreatorState,
  createLauncherState,
  createPositionManagerState,
  pollNewTokens,
  extractTrendingConcepts,
  scoreConcepts,
  scoreConceptsWithLLM,
  extractAndAnalyzeConcepts,
  clearAnalysisCache,
  selectLaunchCandidate,
  generateTokenConcept,
  launchToken,
  canLaunch,
  buyOwnToken,
  monitorPositions,
  getPortfolioStatus,
} from "./contexts/index.js";
import { makeDecision, getMarketConditions } from "./decision/engine.js";
import { checkSafetyConditions } from "./safety.js";
import {
  sendAlert,
  alertLaunchSuccess,
  alertPositionOpened,
  alertPositionExit,
  alertError,
  alertIdentityRegistered,
  alertShutdown,
} from "./alerts.js";
import { SAFETY_LIMITS, INTERVALS } from "./constants.js";
import { createClientEvmSigner, createX402Fetch, type X402Client } from "./x402/index.js";
import {
  getExistingIdentity,
  registerAgentIdentity,
  getRegistryAddress,
  generateAgentRegistrationJSON,
  type IdentityConfig,
} from "./identity/index.js";
import type { AgentState } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const ENABLE_LLM_SCORING = process.env.ENABLE_LLM_SCORING === "true";
const LLM_ANALYSIS_LIMIT = parseInt(process.env.LLM_ANALYSIS_LIMIT || "5", 10);
const CACHE_CLEAR_INTERVAL = 12; // Clear LLM cache every 12 cycles (~12 min)
const ENABLE_IDENTITY_REGISTRATION = process.env.ENABLE_IDENTITY_REGISTRATION === "true";

// ═══════════════════════════════════════════════════════════════════════════
// AGENT STATE CONTAINER
// ═══════════════════════════════════════════════════════════════════════════

interface AgentContexts {
  monitor: ReturnType<typeof createMonitorState>;
  analyzer: ReturnType<typeof createAnalyzerState>;
  creator: ReturnType<typeof createCreatorState>;
  launcher: ReturnType<typeof createLauncherState>;
  positionManager: ReturnType<typeof createPositionManagerState>;
}

function createAgentContexts(): AgentContexts {
  return {
    monitor: createMonitorState(),
    analyzer: createAnalyzerState(),
    creator: createCreatorState(),
    launcher: createLauncherState(),
    positionManager: createPositionManagerState(),
  };
}

function getAgentState(
  contexts: AgentContexts,
  ethBalance: bigint
): AgentState {
  return {
    ethBalance,
    usdcBalance: BigInt(0), // TODO: Track USDC balance
    launchedTokens: contexts.launcher.launchedTokens,
    scoredConcepts: contexts.analyzer.scoredConcepts,
    lastLaunchTimestamp: contexts.launcher.lastLaunchTimestamp,
    consecutiveFailures: 0, // TODO: Track failures
    dailyGasSpent: BigInt(0), // TODO: Track gas
    todayLaunchCount: contexts.launcher.dailyLaunchCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string, level: "info" | "warn" | "error" = "info"): void {
  const timestamp = new Date().toISOString();
  const prefix = { info: "ℹ️", warn: "⚠️", error: "❌" }[level];
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════

let isShuttingDown = false;
let healthServer: Server | null = null;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log(`Received ${signal}. Shutting down gracefully...`, "warn");

  try {
    await alertShutdown(`${signal} received`);
  } catch {
    // Best effort alert
  }

  if (healthServer) {
    healthServer.close();
  }

  log("Shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AUTONOMOUS LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log("🚀 Starting Autonomous Token Launcher Agent...");
  const startTime = Date.now();

  // Initialize CDP wallet
  log("Initializing CDP wallet...");
  const { walletProvider } = await initializeAgentWallet();
  const { publicClient, walletClient, walletAddress } =
    await createFlaunchClient(walletProvider);
  log(`📍 Agent wallet: ${walletAddress}`);

  // ─── Wallet Readiness Check ──────────────────────────────────────────
  log("Checking wallet readiness...");
  const readiness = await checkWalletReadiness(publicClient, walletAddress);
  if (readiness.isReady) {
    log(`✅ Wallet ready: ${readiness.ethBalanceFormatted}`);
  } else {
    log(`⚠️ Wallet not fully funded:`, "warn");
    for (const issue of readiness.issues) {
      log(`  - ${issue}`, "warn");
    }
    for (const rec of readiness.recommendations) {
      log(`  → ${rec}`, "info");
    }
    log("Continuing in monitoring-only mode...", "warn");
  }

  // ─── x402 Micropayment Client ────────────────────────────────────────
  let x402Client: X402Client | null = null;
  try {
    const signer = createClientEvmSigner(walletProvider);
    x402Client = createX402Fetch(signer);
    log("x402 micropayment client initialized");
  } catch (error) {
    log(`x402 init skipped: ${error}`, "warn");
  }

  // ─── ERC-8004 Identity Registration ──────────────────────────────────
  if (ENABLE_IDENTITY_REGISTRATION) {
    log("Checking on-chain identity (ERC-8004)...");
    const registryAddress = getRegistryAddress();

    try {
      // Check if already registered
      const existingId = process.env.ERC8004_AGENT_ID
        ? BigInt(process.env.ERC8004_AGENT_ID)
        : await getExistingIdentity(registryAddress, walletAddress, publicClient);

      if (existingId !== null) {
        log(`Identity already registered: Agent ID ${existingId}`);
      } else {
        // Generate registration JSON
        const regJson = generateAgentRegistrationJSON({
          name: "Janus Token Launcher",
          description: "Autonomous meme token launcher agent on Base via Flaunch",
          walletAddress,
          services: ["token-launch", "position-management", "trend-analysis"],
          x402Enabled: x402Client !== null,
          version: "0.1.0",
        });
        log(`Registration JSON: ${JSON.stringify(regJson)}`);

        // Register on-chain
        const agentURI = process.env.AGENT_URI || `data:application/json,${encodeURIComponent(JSON.stringify(regJson))}`;
        const config: IdentityConfig = {
          registryAddress,
          agentURI,
        };

        const identity = await registerAgentIdentity(
          config,
          publicClient,
          walletClient,
          walletAddress
        );
        log(`✅ Registered on-chain! Agent ID: ${identity.agentId}, TX: ${identity.txHash}`);
        await alertIdentityRegistered(identity.agentId.toString(), registryAddress);
      }
    } catch (error) {
      log(`Identity registration skipped: ${error}`, "warn");
    }
  }

  // Initialize contexts
  const contexts = createAgentContexts();
  log("Contexts initialized");
  log(`LLM-enhanced scoring: ${ENABLE_LLM_SCORING ? "ENABLED" : "DISABLED"}`);
  if (ENABLE_LLM_SCORING) {
    log(`LLM analysis limit: ${LLM_ANALYSIS_LIMIT} concepts per cycle`);
  }

  // Check initial balance
  const initialBalance = await publicClient.getBalance({ address: walletAddress });
  log(`💰 Initial balance: ${Number(initialBalance) / 1e18} ETH`);

  // Send startup alert
  await sendAlert("Agent started", "info", {
    Wallet: walletAddress.slice(0, 10) + "...",
    Balance: `${(Number(initialBalance) / 1e18).toFixed(4)} ETH`,
    "LLM Mode": ENABLE_LLM_SCORING ? "Enabled" : "Disabled",
    "x402": x402Client ? "Enabled" : "Disabled",
    "Identity": ENABLE_IDENTITY_REGISTRATION ? "Enabled" : "Disabled",
  });

  // Main autonomous loop
  let cycleCount = 0;
  while (!isShuttingDown) {
    cycleCount++;
    const cycleStart = Date.now();
    log(`\n═══ Cycle ${cycleCount} ═══`);

    try {
      // Get current balance
      const ethBalance = await publicClient.getBalance({ address: walletAddress });
      const agentState = getAgentState(contexts, ethBalance);

      // 1. Safety check
      log("Running safety checks...");
      const safety = await checkSafetyConditions(
        walletProvider,
        publicClient,
        agentState
      );
      if (!safety.safe) {
        log(`Safety check failed: ${safety.reason}`, "warn");
        await sleep(INTERVALS.mainLoopMs);
        continue;
      }

      // 2. Monitor: Poll for new tokens
      log("👀 Polling Flaunch for new tokens...");
      const pollResult = await pollNewTokens(contexts.monitor);
      log(`Found ${pollResult.tokensFound} tokens (${pollResult.newTokens} new)`);

      // 3. Extract trending concepts
      log("📊 Extracting trending concepts...");
      const concepts = await extractTrendingConcepts(contexts.monitor);
      log(`Trending concepts: ${concepts.slice(0, 5).join(", ")}`);

      // 4. Get market conditions (needed for scoring and decision)
      log("📈 Fetching market conditions...");
      const marketConditions = await getMarketConditions();

      // 5. Score concepts (with optional LLM enhancement)
      if (concepts.length > 0) {
        // Get market context for LLM-enhanced scoring
        const topPerformers = contexts.monitor.recentTokens
          .slice(0, 10)
          .map((p) => p.memecoin.symbol);
        const marketContext = {
          recentLaunches: marketConditions.recentLaunches,
          topPerformers,
          hourlyVolume: marketConditions.hourlyVolume.toString(),
        };

        if (ENABLE_LLM_SCORING) {
          log("🧠 Scoring concepts with LLM enhancement...");
          await scoreConceptsWithLLM(
            contexts.analyzer,
            concepts,
            contexts.monitor.recentTokens,
            marketContext,
            LLM_ANALYSIS_LIMIT
          );
        } else {
          log("🧠 Scoring concepts...");
          await scoreConcepts(
            contexts.analyzer,
            concepts,
            contexts.monitor.recentTokens
          );
        }

        const topScored = contexts.analyzer.scoredConcepts[0];
        if (topScored) {
          const llmInfo = topScored.factors?.llmScore
            ? ` [LLM: ${topScored.factors.llmScore.toFixed(2)}]`
            : "";
          log(`Top concept: "${topScored.concept}" (score: ${topScored.score.toFixed(2)})${llmInfo}`);
        }

        // Clear LLM cache periodically to get fresh analysis
        if (ENABLE_LLM_SCORING && cycleCount % CACHE_CLEAR_INTERVAL === 0) {
          log("Clearing LLM analysis cache for fresh data...");
          clearAnalysisCache(contexts.analyzer);
        }
      }

      // 6. Decision: Should we launch?
      log("🎯 Making launch decision...");
      const decision = await makeDecision(agentState, marketConditions);
      log(
        `Decision: ${decision.shouldLaunch ? "LAUNCH" : "WAIT"} (confidence: ${decision.confidence.toFixed(2)})`
      );
      log(`Reasoning: ${decision.reasoning}`);

      // 7. If decision is to launch
      if (
        decision.shouldLaunch &&
        decision.confidence > SAFETY_LIMITS.minConfidenceThreshold &&
        decision.suggestedConcept
      ) {
        // Check cooldown
        const launchCheck = canLaunch(contexts.launcher);
        if (!launchCheck.canLaunch) {
          log(`Cannot launch: ${launchCheck.reason}`, "warn");
        } else {
          // Generate token metadata
          log(`🎨 Generating token for concept: "${decision.suggestedConcept}"`);
          const metadata = await generateTokenConcept(contexts.creator, {
            baseConcept: decision.suggestedConcept,
            iterationType: "derivative",
            style: "meme",
          });
          log(`Generated: ${metadata.name} ($${metadata.symbol})`);

          // Launch token
          log("🚀 Launching token...");
          const launchResult = await launchToken(
            contexts.launcher,
            {
              name: metadata.name,
              symbol: metadata.symbol,
              description: metadata.description,
              base64Image: metadata.base64Image,
            },
            publicClient,
            walletClient,
            walletAddress
          );

          if (launchResult.success && launchResult.tokenAddress) {
            log(`✅ Token launched! TX: ${launchResult.txHash}`);
            await alertLaunchSuccess(
              metadata.symbol,
              launchResult.txHash!,
              launchResult.tokenAddress
            );

            // Buy own token
            log(`💎 Buying position in ${metadata.symbol}...`);
            const buyResult = await buyOwnToken(
              contexts.positionManager,
              launchResult.tokenAddress,
              metadata.symbol,
              publicClient,
              walletClient,
              walletAddress
            );

            if (buyResult.success) {
              log(
                `✅ Position opened: ${buyResult.tokensReceived} tokens for ${buyResult.costBasisETH} wei`
              );
              await alertPositionOpened(
                metadata.symbol,
                String(Number(buyResult.costBasisETH) / 1e18),
                String(buyResult.tokensReceived)
              );
            } else {
              log(`Position skipped: ${buyResult.reason}`, "warn");
            }
          } else {
            log(`Launch failed: ${launchResult.error}`, "error");
            await alertError(launchResult.error || "Unknown error", "Token launch");
          }
        }
      }

      // 8. Monitor positions (every cycle)
      if (contexts.positionManager.activePositions.length > 0) {
        log("📈 Monitoring active positions...");
        const positionResults = await monitorPositions(
          contexts.positionManager,
          publicClient,
          walletClient
        );
        log(`Checked ${positionResults.checked} positions`);

        for (const exit of positionResults.exits) {
          log(`💰 ${exit.action}: $${exit.token} at ${exit.multiple}x → ${exit.ethReceived} ETH`);
          await alertPositionExit(
            exit.token,
            exit.action,
            exit.multiple,
            exit.ethReceived
          );
        }
      }

      // 9. Portfolio status
      const portfolio = await getPortfolioStatus(contexts.positionManager);
      log(
        `Portfolio: ${portfolio.activePositions} active, P&L: ${portfolio.totalPnL} ETH`
      );
    } catch (error) {
      log(`Cycle error: ${error}`, "error");
      await alertError(
        error instanceof Error ? error.message : String(error),
        `Cycle ${cycleCount}`
      );
    }

    // Wait for next cycle
    const elapsed = Date.now() - cycleStart;
    const waitTime = Math.max(INTERVALS.mainLoopMs - elapsed, 0);
    log(`Cycle complete in ${elapsed}ms. Waiting ${waitTime}ms...`);
    await sleep(waitTime);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════

let cycleCount = 0;
const startTime = Date.now();

healthServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        timestamp: Date.now(),
        uptime: Date.now() - startTime,
        uptimeFormatted: `${Math.floor((Date.now() - startTime) / 1000)}s`,
        version: "0.1.0",
        features: {
          llmScoring: ENABLE_LLM_SCORING,
          identityRegistration: ENABLE_IDENTITY_REGISTRATION,
        },
      })
    );
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const PORT = process.env.PORT || 3000;
healthServer.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// START AGENT
// ═══════════════════════════════════════════════════════════════════════════

main().catch(async (error) => {
  console.error("Fatal error:", error);
  try {
    await alertShutdown(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  } catch {
    // Best effort
  }
  process.exit(1);
});
