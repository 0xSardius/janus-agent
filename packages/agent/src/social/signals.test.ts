import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSocialSignalProvider } from "./signals.js";

function createMockFetch(responseData: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseData,
  }) as unknown as typeof fetch;
}

describe("createSocialSignalProvider", () => {
  it("returns default score when no APIs configured", async () => {
    const provider = createSocialSignalProvider({});
    const score = await provider.getScore("PEPE");
    expect(score).toBe(0.5);
  });

  it("returns custom default score when configured", async () => {
    const provider = createSocialSignalProvider({ defaultScore: 0.3 });
    const score = await provider.getScore("PEPE");
    expect(score).toBe(0.3);
  });

  it("uses Farcaster only when only Farcaster configured", async () => {
    const mockFetch = createMockFetch({
      result: {
        casts: [
          {
            reactions: { likes_count: 50, recasts_count: 10 },
            replies: { count: 5 },
            author: { fid: 1 },
          },
        ],
      },
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: mockFetch },
    });

    const score = await provider.getScore("PEPE");
    expect(score).toBeGreaterThan(0.1);
    expect(score).toBeLessThanOrEqual(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses Twitter only when only Twitter configured", async () => {
    const mockFetch = createMockFetch({
      data: [
        { public_metrics: { like_count: 100, retweet_count: 20, reply_count: 5 } },
      ],
    });

    const provider = createSocialSignalProvider({
      twitter: { bearerToken: "test-token", fetchFn: mockFetch },
    });

    const score = await provider.getScore("PEPE");
    expect(score).toBeGreaterThan(0.1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("combines both APIs with weights when both configured", async () => {
    const fcFetch = createMockFetch({
      result: {
        casts: [
          { reactions: { likes_count: 100, recasts_count: 30 }, replies: { count: 10 }, author: { fid: 1 } },
        ],
      },
    });
    const twFetch = createMockFetch({
      data: [
        { public_metrics: { like_count: 50, retweet_count: 10, reply_count: 5 } },
      ],
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: fcFetch },
      twitter: { bearerToken: "test-token", fetchFn: twFetch },
      farcasterWeight: 0.6,
      twitterWeight: 0.4,
    });

    const score = await provider.getScore("PEPE");
    expect(score).toBeGreaterThan(0.1);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("caches results within TTL", async () => {
    const mockFetch = createMockFetch({
      result: {
        casts: [
          { reactions: { likes_count: 10, recasts_count: 0 }, replies: { count: 0 }, author: { fid: 1 } },
        ],
      },
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: mockFetch },
      cacheTTLMs: 60000,
    });

    await provider.getScore("PEPE");
    await provider.getScore("PEPE");
    await provider.getScore("PEPE");

    // Only one actual fetch should happen
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("treats concept keys as case-insensitive", async () => {
    const mockFetch = createMockFetch({
      result: { casts: [] },
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: mockFetch },
    });

    await provider.getScore("PEPE");
    await provider.getScore("pepe");
    await provider.getScore("Pepe");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("clearCache forces fresh fetch", async () => {
    const mockFetch = createMockFetch({
      result: { casts: [] },
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: mockFetch },
    });

    await provider.getScore("PEPE");
    provider.clearCache();
    await provider.getScore("PEPE");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getDetails includes signal breakdown", async () => {
    const fcFetch = createMockFetch({
      result: {
        casts: [
          { reactions: { likes_count: 20, recasts_count: 5 }, replies: { count: 3 }, author: { fid: 1 } },
        ],
      },
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: fcFetch },
    });

    const details = await provider.getDetails("PEPE");
    expect(details.farcaster).toBeDefined();
    expect(details.farcaster!.signal.castCount).toBe(1);
    expect(details.farcaster!.normalizedScore).toBeGreaterThan(0);
    expect(details.cachedAt).toBeGreaterThan(0);
  });

  it("degrades gracefully when one API fails", async () => {
    const fcFetch = vi.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;
    const twFetch = createMockFetch({
      data: [
        { public_metrics: { like_count: 50, retweet_count: 10, reply_count: 5 } },
      ],
    });

    const provider = createSocialSignalProvider({
      farcaster: { apiKey: "test-key", fetchFn: fcFetch },
      twitter: { bearerToken: "test-token", fetchFn: twFetch },
    });

    // Should not throw, should use default for failed API
    const score = await provider.getScore("PEPE");
    expect(score).toBeGreaterThan(0);
  });
});
