import { describe, it, expect, vi } from "vitest";
import {
  fetchFarcasterSignals,
  normalizeFarcasterScore,
  type FarcasterSignal,
} from "./farcaster.js";

describe("fetchFarcasterSignals", () => {
  it("parses Neynar search response correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          casts: [
            {
              reactions: { likes_count: 10, recasts_count: 3 },
              replies: { count: 2 },
              author: { fid: 1 },
            },
            {
              reactions: { likes_count: 5, recasts_count: 1 },
              replies: { count: 0 },
              author: { fid: 2 },
            },
          ],
        },
      }),
    });

    const signal = await fetchFarcasterSignals("PEPE", {
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.castCount).toBe(2);
    expect(signal.totalLikes).toBe(15);
    expect(signal.totalRecasts).toBe(4);
    expect(signal.totalReplies).toBe(2);
    expect(signal.uniqueAuthors).toBe(2);
  });

  it("counts unique authors correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          casts: [
            { reactions: { likes_count: 1, recasts_count: 0 }, replies: { count: 0 }, author: { fid: 1 } },
            { reactions: { likes_count: 1, recasts_count: 0 }, replies: { count: 0 }, author: { fid: 1 } },
            { reactions: { likes_count: 1, recasts_count: 0 }, replies: { count: 0 }, author: { fid: 2 } },
          ],
        },
      }),
    });

    const signal = await fetchFarcasterSignals("DOGE", {
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.uniqueAuthors).toBe(2);
    expect(signal.castCount).toBe(3);
  });

  it("sends correct headers and URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { casts: [] } }),
    });

    await fetchFarcasterSignals("cat token", {
      apiKey: "my-key",
      baseUrl: "https://custom.api",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.api/farcaster/cast/search?q=cat%20token&limit=25",
      expect.objectContaining({
        headers: { accept: "application/json", api_key: "my-key" },
      })
    );
  });

  it("throws on non-OK response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(
      fetchFarcasterSignals("PEPE", {
        apiKey: "bad-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow("Neynar API error: 401 Unauthorized");
  });

  it("handles empty result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { casts: [] } }),
    });

    const signal = await fetchFarcasterSignals("obscure", {
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.castCount).toBe(0);
    expect(signal.totalLikes).toBe(0);
    expect(signal.uniqueAuthors).toBe(0);
  });

  it("handles missing fields gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          casts: [
            { reactions: {}, replies: {}, author: { fid: 1 } },
          ],
        },
      }),
    });

    const signal = await fetchFarcasterSignals("test", {
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.castCount).toBe(1);
    expect(signal.totalLikes).toBe(0);
    expect(signal.totalRecasts).toBe(0);
    expect(signal.totalReplies).toBe(0);
  });
});

describe("normalizeFarcasterScore", () => {
  it("returns 0.1 for zero engagement", () => {
    const signal: FarcasterSignal = {
      castCount: 0, totalLikes: 0, totalRecasts: 0, totalReplies: 0,
      uniqueAuthors: 0, queriedAt: Date.now(),
    };
    expect(normalizeFarcasterScore(signal)).toBe(0.1);
  });

  it("returns higher score for more engagement", () => {
    const low: FarcasterSignal = {
      castCount: 2, totalLikes: 5, totalRecasts: 1, totalReplies: 1,
      uniqueAuthors: 2, queriedAt: Date.now(),
    };
    const high: FarcasterSignal = {
      castCount: 20, totalLikes: 100, totalRecasts: 50, totalReplies: 30,
      uniqueAuthors: 15, queriedAt: Date.now(),
    };

    const lowScore = normalizeFarcasterScore(low);
    const highScore = normalizeFarcasterScore(high);

    expect(highScore).toBeGreaterThan(lowScore);
    expect(lowScore).toBeGreaterThanOrEqual(0.1);
    expect(highScore).toBeLessThanOrEqual(1);
  });
});
