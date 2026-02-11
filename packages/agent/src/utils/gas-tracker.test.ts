import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GasTracker, estimateGasFromReceipt } from "./gas-tracker.js";

describe("GasTracker", () => {
  let tracker: GasTracker;

  beforeEach(() => {
    tracker = new GasTracker();
  });

  it("starts with zero gas spent", () => {
    expect(tracker.getTodayGasSpent()).toBe(BigInt(0));
  });

  it("records and accumulates gas", () => {
    tracker.recordGasUsed("0xabc", BigInt(100));
    tracker.recordGasUsed("0xdef", BigInt(200));
    expect(tracker.getTodayGasSpent()).toBe(BigInt(300));
  });

  it("only counts today's records in getTodayGasSpent", () => {
    // Add a record from yesterday by manipulating the records directly
    tracker.loadRecords([
      {
        txHash: "0xold",
        gasUsed: BigInt(999),
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
      },
      {
        txHash: "0xnew",
        gasUsed: BigInt(100),
        timestamp: Date.now(),
      },
    ]);
    expect(tracker.getTodayGasSpent()).toBe(BigInt(100));
  });

  it("returns all records via getRecords", () => {
    tracker.recordGasUsed("0xa", BigInt(50));
    tracker.recordGasUsed("0xb", BigInt(75));
    const records = tracker.getRecords();
    expect(records).toHaveLength(2);
    expect(records[0].txHash).toBe("0xa");
  });

  it("loads records from persistence", () => {
    tracker.loadRecords([
      { txHash: "0x1", gasUsed: BigInt(10), timestamp: Date.now() },
      { txHash: "0x2", gasUsed: BigInt(20), timestamp: Date.now() },
    ]);
    expect(tracker.getTodayGasSpent()).toBe(BigInt(30));
    expect(tracker.getRecords()).toHaveLength(2);
  });

  it("resetDaily removes old records", () => {
    tracker.loadRecords([
      {
        txHash: "0xold",
        gasUsed: BigInt(500),
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
      },
      {
        txHash: "0xtoday",
        gasUsed: BigInt(100),
        timestamp: Date.now(),
      },
    ]);

    tracker.resetDaily();
    expect(tracker.getRecords()).toHaveLength(1);
    expect(tracker.getRecords()[0].txHash).toBe("0xtoday");
  });

  it("resetDaily is idempotent within same day", () => {
    tracker.recordGasUsed("0xa", BigInt(100));
    tracker.resetDaily();
    tracker.resetDaily(); // second call should be no-op
    expect(tracker.getRecords()).toHaveLength(1);
  });

  it("getTodayRecordCount counts correctly", () => {
    tracker.recordGasUsed("0xa", BigInt(100));
    tracker.recordGasUsed("0xb", BigInt(200));
    expect(tracker.getTodayRecordCount()).toBe(2);
  });
});

describe("estimateGasFromReceipt", () => {
  it("calculates gas cost correctly", () => {
    const cost = estimateGasFromReceipt({
      gasUsed: BigInt(21000),
      effectiveGasPrice: BigInt(30e9), // 30 gwei
    });
    expect(cost).toBe(BigInt(21000) * BigInt(30e9));
  });

  it("handles zero gas", () => {
    const cost = estimateGasFromReceipt({
      gasUsed: BigInt(0),
      effectiveGasPrice: BigInt(30e9),
    });
    expect(cost).toBe(BigInt(0));
  });
});
