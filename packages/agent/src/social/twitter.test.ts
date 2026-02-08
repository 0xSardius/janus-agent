import { describe, it, expect, vi } from "vitest";
import {
  fetchTwitterSignals,
  normalizeTwitterScore,
  type TwitterSignal,
} from "./twitter.js";

describe("fetchTwitterSignals", () => {
  it("parses Twitter search response correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { public_metrics: { like_count: 20, retweet_count: 5, reply_count: 3 } },
          { public_metrics: { like_count: 10, retweet_count: 2, reply_count: 1 } },
        ],
        meta: { result_count: 2 },
      }),
    });

    const signal = await fetchTwitterSignals("PEPE", {
      bearerToken: "test-token",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.tweetCount).toBe(2);
    expect(signal.totalLikes).toBe(30);
    expect(signal.totalRetweets).toBe(7);
    expect(signal.totalReplies).toBe(4);
  });

  it("sends correct Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await fetchTwitterSignals("test", {
      bearerToken: "my-bearer",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/tweets/search/recent"),
      expect.objectContaining({
        headers: { Authorization: "Bearer my-bearer" },
      })
    );
  });

  it("throws on non-OK response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    await expect(
      fetchTwitterSignals("PEPE", {
        bearerToken: "test",
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow("Twitter API error: 429 Too Many Requests");
  });

  it("handles empty data response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ meta: { result_count: 0 } }),
    });

    const signal = await fetchTwitterSignals("obscure", {
      bearerToken: "test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.tweetCount).toBe(0);
    expect(signal.totalLikes).toBe(0);
  });

  it("handles missing public_metrics gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "1" }, { public_metrics: { like_count: 5 } }],
      }),
    });

    const signal = await fetchTwitterSignals("test", {
      bearerToken: "test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(signal.tweetCount).toBe(2);
    expect(signal.totalLikes).toBe(5);
    expect(signal.totalRetweets).toBe(0);
  });
});

describe("normalizeTwitterScore", () => {
  it("returns 0.1 for zero engagement", () => {
    const signal: TwitterSignal = {
      tweetCount: 0, totalLikes: 0, totalRetweets: 0, totalReplies: 0,
      queriedAt: Date.now(),
    };
    expect(normalizeTwitterScore(signal)).toBe(0.1);
  });

  it("returns higher score for more engagement", () => {
    const low: TwitterSignal = {
      tweetCount: 1, totalLikes: 3, totalRetweets: 0, totalReplies: 0,
      queriedAt: Date.now(),
    };
    const high: TwitterSignal = {
      tweetCount: 25, totalLikes: 200, totalRetweets: 80, totalReplies: 50,
      queriedAt: Date.now(),
    };

    expect(normalizeTwitterScore(high)).toBeGreaterThan(normalizeTwitterScore(low));
  });
});
