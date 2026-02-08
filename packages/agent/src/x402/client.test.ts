import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createClientEvmSigner,
  createX402Fetch,
  SpendTracker,
  type WalletProviderSigner,
  type X402ClientConfig,
} from "./client.js";
import { X402_CONFIG } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK WALLET PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

function createMockWalletProvider(): WalletProviderSigner {
  return {
    signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    getAddress: vi.fn().mockResolvedValue("0x1234567890abcdef1234567890abcdef12345678"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNER ADAPTER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createClientEvmSigner", () => {
  it("should create signer from wallet provider", () => {
    const provider = createMockWalletProvider();
    const signer = createClientEvmSigner(provider);

    expect(signer).toBeDefined();
    expect(typeof signer.signTypedData).toBe("function");
    expect(typeof signer.getAddress).toBe("function");
  });

  it("should delegate signTypedData to wallet provider", async () => {
    const provider = createMockWalletProvider();
    const signer = createClientEvmSigner(provider);

    const params = {
      domain: { name: "test" },
      types: { Test: [{ name: "value", type: "string" }] },
      primaryType: "Test",
      message: { value: "hello" },
    };

    const result = await signer.signTypedData(params);

    expect(result).toBe("0xmocksignature");
    expect(provider.signTypedData).toHaveBeenCalledWith(params);
  });

  it("should delegate getAddress to wallet provider", async () => {
    const provider = createMockWalletProvider();
    const signer = createClientEvmSigner(provider);

    const address = await signer.getAddress();

    expect(address).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(provider.getAddress).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPEND TRACKER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("SpendTracker", () => {
  let tracker: SpendTracker;
  const config: X402ClientConfig = {
    maxPaymentPerRequestUSD: 0.10,
    maxDailyPaymentsUSD: 5.00,
    facilitatorUrl: "https://test.com/facilitator",
  };

  beforeEach(() => {
    tracker = new SpendTracker();
  });

  it("should start with zero daily spend", () => {
    expect(tracker.getDailySpendUSD()).toBe(0);
  });

  it("should start with empty records", () => {
    expect(tracker.getRecords()).toEqual([]);
  });

  it("should allow spending within per-request limit", () => {
    expect(tracker.canSpend(0.05, config)).toBe(true);
  });

  it("should reject spending above per-request limit", () => {
    expect(tracker.canSpend(0.15, config)).toBe(false);
  });

  it("should track daily spend after recording payment", () => {
    tracker.recordPayment("https://api.example.com", 0.05);
    expect(tracker.getDailySpendUSD()).toBe(0.05);
  });

  it("should reject when daily limit would be exceeded", () => {
    // Spend most of daily budget
    tracker.recordPayment("https://api.example.com", 0.09);
    tracker.recordPayment("https://api.example.com", 0.09);
    tracker.recordPayment("https://api.example.com", 0.09);
    tracker.recordPayment("https://api.example.com", 0.09);
    tracker.recordPayment("https://api.example.com", 0.09);
    // 5 * 0.09 = 0.45, so we have $4.55 spent

    // Now we'd need 46 more to hit $5
    for (let i = 0; i < 50; i++) {
      tracker.recordPayment("https://api.example.com", 0.09);
    }

    // Should reject as daily limit exceeded
    expect(tracker.canSpend(0.10, config)).toBe(false);
  });

  it("should store payment records", () => {
    tracker.recordPayment("https://api.example.com/data", 0.05, "0xtxhash");

    const records = tracker.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe("https://api.example.com/data");
    expect(records[0].amount).toBe("0.05");
    expect(records[0].currency).toBe("USD");
    expect(records[0].txHash).toBe("0xtxhash");
    expect(records[0].timestamp).toBeGreaterThan(0);
  });

  it("should reset daily spend", () => {
    tracker.recordPayment("https://api.example.com", 0.05);
    expect(tracker.getDailySpendUSD()).toBe(0.05);

    tracker.reset();
    expect(tracker.getDailySpendUSD()).toBe(0);
    expect(tracker.getRecords()).toEqual([]);
  });

  it("should return copies of records (not references)", () => {
    tracker.recordPayment("https://api.example.com", 0.05);

    const records1 = tracker.getRecords();
    const records2 = tracker.getRecords();

    expect(records1).not.toBe(records2);
    expect(records1).toEqual(records2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// X402 CLIENT CONFIG TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("X402_CONFIG", () => {
  it("should have max payment per request of $0.10", () => {
    expect(X402_CONFIG.maxPaymentPerRequestUSD).toBe(0.10);
  });

  it("should have max daily payments of $5.00", () => {
    expect(X402_CONFIG.maxDailyPaymentsUSD).toBe(5.00);
  });

  it("should have a facilitator URL", () => {
    expect(X402_CONFIG.facilitatorUrl).toContain("x402");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// X402 FETCH WRAPPER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createX402Fetch", () => {
  let mockProvider: WalletProviderSigner;

  beforeEach(() => {
    mockProvider = createMockWalletProvider();
    vi.restoreAllMocks();
  });

  it("should create an X402 client with fetch function", () => {
    const signer = createClientEvmSigner(mockProvider);
    const client = createX402Fetch(signer);

    expect(client).toBeDefined();
    expect(typeof client.fetch).toBe("function");
    expect(typeof client.getPaymentRecords).toBe("function");
    expect(typeof client.getDailySpendUSD).toBe("function");
    expect(typeof client.resetDailySpend).toBe("function");
  });

  it("should pass through non-402 responses unchanged", async () => {
    const signer = createClientEvmSigner(mockProvider);
    const client = createX402Fetch(signer);

    const mockResponse = new Response(JSON.stringify({ data: "test" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const response = await client.fetch("https://api.example.com/data");

    expect(response.status).toBe(200);
    const body = await response.json() as { data: string };
    expect(body.data).toBe("test");
  });

  it("should return 402 response when no payment header present", async () => {
    const signer = createClientEvmSigner(mockProvider);
    const client = createX402Fetch(signer);

    const mockResponse = new Response("Payment Required", { status: 402 });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const response = await client.fetch("https://api.example.com/paid");

    expect(response.status).toBe(402);
  });

  it("should reject payments exceeding per-request limit", async () => {
    const signer = createClientEvmSigner(mockProvider);
    const config: X402ClientConfig = {
      maxPaymentPerRequestUSD: 0.05,
      maxDailyPaymentsUSD: 5.00,
      facilitatorUrl: "https://test.com",
    };
    const client = createX402Fetch(signer, config);

    const mockResponse = new Response("Payment Required", {
      status: 402,
      headers: {
        "X-Payment-Required": JSON.stringify({
          amount: "0.10", // Exceeds $0.05 limit
          currency: "USD",
        }),
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const response = await client.fetch("https://api.example.com/expensive");

    // Should return the 402 without paying
    expect(response.status).toBe(402);
    expect(client.getDailySpendUSD()).toBe(0);
  });

  it("should process valid 402 payments", async () => {
    const signer = createClientEvmSigner(mockProvider);
    const client = createX402Fetch(signer);

    const paymentResponse = new Response("Payment Required", {
      status: 402,
      headers: {
        "X-Payment-Required": JSON.stringify({
          amount: "0.05",
          currency: "USD",
          facilitator: "https://facilitator.example.com",
        }),
      },
    });

    const successResponse = new Response(JSON.stringify({ data: "paid content" }), {
      status: 200,
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(paymentResponse)
      .mockResolvedValueOnce(successResponse);

    const response = await client.fetch("https://api.example.com/paid");

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify payment was recorded
    expect(client.getDailySpendUSD()).toBe(0.05);
    expect(client.getPaymentRecords()).toHaveLength(1);
  });

  it("should reset daily spend", () => {
    const signer = createClientEvmSigner(mockProvider);
    const client = createX402Fetch(signer);

    client.resetDailySpend();
    expect(client.getDailySpendUSD()).toBe(0);
  });
});
