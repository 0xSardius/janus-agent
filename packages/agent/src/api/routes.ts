import type { ServerResponse } from "http";
import type { AnalyzerState } from "../contexts/analyzer.js";
import type { PositionManagerState } from "../contexts/position-manager.js";
import type { PerformanceState } from "../performance/index.js";
import type { SocialSignalProvider } from "../social/index.js";
import type { PoolData } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiContext {
  getAnalyzerState: () => AnalyzerState;
  getPositionManagerState: () => PositionManagerState;
  getPerformanceState?: () => PerformanceState;
  getSocialProvider?: () => SocialSignalProvider | null;
  getRecentPools?: () => PoolData[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

function jsonResponse(res: ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/trends — current scored concepts
 */
export function handleTrends(res: ServerResponse, ctx: ApiContext): void {
  const state = ctx.getAnalyzerState();
  jsonResponse(res, {
    concepts: state.scoredConcepts.map((c) => ({
      concept: c.concept,
      score: c.score,
      factors: c.factors,
    })),
    count: state.scoredConcepts.length,
    timestamp: Date.now(),
  });
}

/**
 * GET /api/scores/:concept — on-demand concept scoring
 */
export async function handleScoreConcept(
  res: ServerResponse,
  concept: string,
  ctx: ApiContext
): Promise<void> {
  const socialProvider = ctx.getSocialProvider?.();

  // Check if we have a cached score already
  const state = ctx.getAnalyzerState();
  const existing = state.scoredConcepts.find(
    (c) => c.concept.toLowerCase() === concept.toLowerCase()
  );

  if (existing) {
    jsonResponse(res, {
      concept: existing.concept,
      score: existing.score,
      factors: existing.factors,
      source: "cached",
      timestamp: Date.now(),
    });
    return;
  }

  // Get social score if provider available
  let socialScore: number | undefined;
  if (socialProvider) {
    try {
      socialScore = await socialProvider.getScore(concept);
    } catch {
      // Ignore social signal errors
    }
  }

  jsonResponse(res, {
    concept,
    socialScore: socialScore ?? null,
    source: "on-demand",
    message: "Full scoring requires concept to be in current cycle",
    timestamp: Date.now(),
  });
}

/**
 * GET /api/portfolio — active positions and P&L
 */
export function handlePortfolio(res: ServerResponse, ctx: ApiContext): void {
  const state = ctx.getPositionManagerState();

  const active = state.activePositions.map((p) => ({
    token: p.tokenSymbol,
    address: p.tokenAddress,
    costBasisETH: p.costBasisETH.toString(),
    tranchesSold: p.tranchesSold,
    status: p.status,
    boughtAt: p.boughtAt,
    concept: p.concept,
  }));

  const totalInvested = state.totalInvested.toString();
  const totalReturned = state.totalReturned.toString();

  jsonResponse(res, {
    activePositions: active,
    activeCount: state.activePositions.length,
    closedCount: state.closedPositions.length,
    totalInvested: totalInvested,
    totalReturned: totalReturned,
    timestamp: Date.now(),
  });
}

/**
 * GET /api/performance — historical results, success rate, category breakdown
 */
export function handlePerformance(res: ServerResponse, ctx: ApiContext): void {
  const perfState = ctx.getPerformanceState?.();

  if (!perfState) {
    jsonResponse(res, {
      error: "Performance tracking not enabled",
      message: "Enable ENABLE_AUTO_TUNER to track performance",
    }, 404);
    return;
  }

  // Category breakdown
  const categories: Record<string, { totalResults: number; avgScore: number; emaScore: number }> = {};
  for (const [cat, perf] of perfState.categoryPerformance.entries()) {
    categories[cat] = {
      totalResults: perf.totalResults,
      avgScore: perf.avgScore,
      emaScore: perf.emaScore,
    };
  }

  // Recent results (last 20)
  const recentResults = perfState.results.slice(-20).map((r) => ({
    concept: r.concept,
    category: r.category,
    profitMultiple: r.profitMultiple,
    performanceScore: r.performanceScore,
    exitAction: r.exitAction,
    timestamp: r.timestamp,
  }));

  // Success rate
  const totalResults = perfState.results.length;
  const successes = perfState.results.filter((r) => r.profitMultiple >= 1.0).length;

  jsonResponse(res, {
    totalResults,
    successRate: totalResults > 0 ? successes / totalResults : null,
    categories,
    recentResults,
    factorCorrelations: Object.fromEntries(perfState.factorCorrelations),
    timestamp: Date.now(),
  });
}
