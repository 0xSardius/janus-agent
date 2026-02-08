import { describe, it, expect, afterEach } from "vitest";
import type { Server } from "http";
import { createApiServer } from "./server.js";
import { createAnalyzerState } from "../contexts/analyzer.js";
import { createPositionManagerState } from "../contexts/position-manager.js";
import type { ApiContext } from "./routes.js";

function createTestContext(): ApiContext {
  return {
    getAnalyzerState: () => createAnalyzerState(),
    getPositionManagerState: () => createPositionManagerState(),
  };
}

async function fetchFromServer(server: Server, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server not listening");

  const response = await fetch(`http://localhost:${address.port}${path}`, { headers });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

describe("createApiServer", () => {
  let server: Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it("responds to /health with 200", async () => {
    server = createApiServer({ port: 0 }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status, body } = await fetchFromServer(server, "/health");
    expect(status).toBe(200);
    expect((body as { status: string }).status).toBe("ok");
  });

  it("returns 404 for unknown routes", async () => {
    server = createApiServer({ port: 0 }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status } = await fetchFromServer(server, "/unknown");
    expect(status).toBe(404);
  });

  it("serves /api/trends without gating", async () => {
    server = createApiServer({ port: 0 }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status, body } = await fetchFromServer(server, "/api/trends");
    expect(status).toBe(200);
    expect((body as { concepts: unknown[] }).concepts).toBeDefined();
  });

  it("serves /api/portfolio without gating", async () => {
    server = createApiServer({ port: 0 }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status, body } = await fetchFromServer(server, "/api/portfolio");
    expect(status).toBe(200);
    expect((body as { activeCount: number }).activeCount).toBe(0);
  });

  it("returns 402 when gating is enabled and no proof", async () => {
    server = createApiServer(
      { port: 0, gating: { enableGating: true, pricePerRequestUSD: 0.01 } },
      createTestContext()
    );
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status, body } = await fetchFromServer(server, "/api/trends");
    expect(status).toBe(402);
    expect((body as { error: string }).error).toBe("Payment Required");
  });

  it("allows gated request with valid proof", async () => {
    server = createApiServer(
      { port: 0, gating: { enableGating: true } },
      createTestContext()
    );
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const proof = JSON.stringify({ signature: "0xabc", payer: "0x123" });
    const { status } = await fetchFromServer(server, "/api/trends", {
      "X-Payment-Proof": proof,
    });
    expect(status).toBe(200);
  });

  it("serves /api/scores/:concept", async () => {
    server = createApiServer({ port: 0 }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { status, body } = await fetchFromServer(server, "/api/scores/PEPE");
    expect(status).toBe(200);
    expect((body as { concept: string }).concept).toBe("PEPE");
  });

  it("includes version in health response", async () => {
    server = createApiServer({ port: 0, version: "1.0.0" }, createTestContext());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const { body } = await fetchFromServer(server, "/health");
    expect((body as { version: string }).version).toBe("1.0.0");
  });
});
