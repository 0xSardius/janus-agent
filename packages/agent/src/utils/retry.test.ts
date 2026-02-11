import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelayMs: 1, maxRetries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fail"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow("always fail");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("respects shouldRetry predicate", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-retryable"));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        shouldRetry: (err) =>
          err instanceof Error && err.message !== "non-retryable",
      })
    ).rejects.toThrow("non-retryable");
    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });

  it("uses exponential backoff", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0); // Execute immediately for test speed
    }) as typeof setTimeout);

    const fnMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    await withRetry(fnMock, { baseDelayMs: 100, maxRetries: 3 });

    // First delay: 100ms (100 * 2^0)
    // Second delay: 200ms (100 * 2^1)
    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);

    vi.restoreAllMocks();
  });

  it("caps delay at maxDelayMs", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout);

    const fnMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    await withRetry(fnMock, { baseDelayMs: 1000, maxDelayMs: 1500, maxRetries: 3 });

    // 1000, 2000→capped to 1500, 4000→capped to 1500
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(1500);
    expect(delays[2]).toBe(1500);

    vi.restoreAllMocks();
  });
});
