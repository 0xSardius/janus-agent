import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { verifyX402Payment, send402Response, type X402GatingConfig } from "./middleware.js";
import {
  handleTrends,
  handleScoreConcept,
  handlePortfolio,
  handlePerformance,
  type ApiContext,
} from "./routes.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiServerConfig {
  port?: number;
  gating?: X402GatingConfig;
  version?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createApiServer(
  config: ApiServerConfig,
  context: ApiContext
): Server {
  const startTime = Date.now();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || "/";
    const method = req.method || "GET";

    // ─── Health Check (always free) ──────────────────────────────────
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        timestamp: Date.now(),
        uptime: Date.now() - startTime,
        uptimeFormatted: `${Math.floor((Date.now() - startTime) / 1000)}s`,
        version: config.version || "0.1.0",
        features: {
          apiGating: config.gating?.enableGating ?? false,
        },
      }));
      return;
    }

    // ─── API Routes (potentially gated) ──────────────────────────────
    if (url.startsWith("/api/")) {
      // x402 gating check
      if (config.gating?.enableGating) {
        const paid = await verifyX402Payment(req, config.gating);
        if (!paid) {
          send402Response(res, config.gating);
          return;
        }
      }

      try {
        await routeApiRequest(url, method, res, context);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        }));
      }
      return;
    }

    // ─── 404 ─────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════

async function routeApiRequest(
  url: string,
  method: string,
  res: ServerResponse,
  ctx: ApiContext
): Promise<void> {
  if (method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  // GET /api/trends
  if (url === "/api/trends") {
    handleTrends(res, ctx);
    return;
  }

  // GET /api/scores/:concept
  const scoreMatch = url.match(/^\/api\/scores\/(.+)$/);
  if (scoreMatch) {
    const concept = decodeURIComponent(scoreMatch[1]);
    await handleScoreConcept(res, concept, ctx);
    return;
  }

  // GET /api/portfolio
  if (url === "/api/portfolio") {
    handlePortfolio(res, ctx);
    return;
  }

  // GET /api/performance
  if (url === "/api/performance") {
    handlePerformance(res, ctx);
    return;
  }

  // Unknown API route
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unknown API endpoint" }));
}
