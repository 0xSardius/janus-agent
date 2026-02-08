import { X402_CONFIG } from "../constants.js";
import type { X402PaymentRecord } from "../types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface X402ClientConfig {
  maxPaymentPerRequestUSD: number;
  maxDailyPaymentsUSD: number;
  facilitatorUrl: string;
}

export interface X402Client {
  fetch: typeof globalThis.fetch;
  getPaymentRecords: () => X402PaymentRecord[];
  getDailySpendUSD: () => number;
  resetDailySpend: () => void;
}

export interface SignTypedDataParams {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface WalletProviderSigner {
  signTypedData: (params: SignTypedDataParams) => Promise<string>;
  getAddress: () => Promise<string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT EVM SIGNER ADAPTER
// Bridges CDP AgentKit wallet to x402's signer interface
// ═══════════════════════════════════════════════════════════════════════════

export function createClientEvmSigner(walletProvider: WalletProviderSigner) {
  return {
    async signTypedData(params: SignTypedDataParams): Promise<string> {
      return walletProvider.signTypedData(params);
    },
    async getAddress(): Promise<string> {
      return walletProvider.getAddress();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY SPEND TRACKER
// ═══════════════════════════════════════════════════════════════════════════

export class SpendTracker {
  private records: X402PaymentRecord[] = [];
  private dailySpendUSD = 0;
  private lastResetDate: string;

  constructor() {
    this.lastResetDate = new Date().toISOString().slice(0, 10);
  }

  checkAndResetDaily(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDate) {
      this.dailySpendUSD = 0;
      this.lastResetDate = today;
    }
  }

  canSpend(amountUSD: number, config: X402ClientConfig): boolean {
    this.checkAndResetDaily();

    if (amountUSD > config.maxPaymentPerRequestUSD) {
      return false;
    }

    if (this.dailySpendUSD + amountUSD > config.maxDailyPaymentsUSD) {
      return false;
    }

    return true;
  }

  recordPayment(url: string, amountUSD: number, txHash?: string): void {
    this.dailySpendUSD += amountUSD;
    this.records.push({
      url,
      amount: amountUSD.toString(),
      currency: "USD",
      timestamp: Date.now(),
      txHash,
    });
  }

  getDailySpendUSD(): number {
    this.checkAndResetDaily();
    return this.dailySpendUSD;
  }

  getRecords(): X402PaymentRecord[] {
    return [...this.records];
  }

  reset(): void {
    this.dailySpendUSD = 0;
    this.records = [];
    this.lastResetDate = new Date().toISOString().slice(0, 10);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// x402 FETCH WRAPPER
// Wraps native fetch with x402 payment capabilities
// ═══════════════════════════════════════════════════════════════════════════

export function createX402Fetch(
  signer: ReturnType<typeof createClientEvmSigner>,
  config: X402ClientConfig = X402_CONFIG
): X402Client {
  const tracker = new SpendTracker();

  const x402Fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // Make the initial request
    const response = await globalThis.fetch(input, init);

    // If not a 402 Payment Required, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse the 402 response to get payment details
    const paymentHeader = response.headers.get("X-Payment-Required");
    if (!paymentHeader) {
      return response;
    }

    let paymentDetails: { amount?: string; currency?: string; facilitator?: string };
    try {
      paymentDetails = JSON.parse(paymentHeader);
    } catch {
      console.warn("[x402] Failed to parse payment header:", paymentHeader);
      return response;
    }

    const amountUSD = parseFloat(paymentDetails.amount || "0");

    // Safety check: ensure we can afford this payment
    if (!tracker.canSpend(amountUSD, config)) {
      console.warn(
        `[x402] Payment rejected: $${amountUSD} exceeds limits ` +
        `(per-request max: $${config.maxPaymentPerRequestUSD}, ` +
        `daily spent: $${tracker.getDailySpendUSD()}/$${config.maxDailyPaymentsUSD})`
      );
      return response;
    }

    // Sign the payment authorization
    const signerAddress = await signer.getAddress();
    const facilitator = paymentDetails.facilitator || config.facilitatorUrl;

    try {
      const signature = await signer.signTypedData({
        domain: {
          name: "x402",
          version: "1",
          chainId: 8453, // Base
        },
        types: {
          Payment: [
            { name: "url", type: "string" },
            { name: "amount", type: "string" },
            { name: "currency", type: "string" },
            { name: "payer", type: "address" },
          ],
        },
        primaryType: "Payment",
        message: {
          url,
          amount: paymentDetails.amount || "0",
          currency: paymentDetails.currency || "USD",
          payer: signerAddress,
        },
      });

      // Retry the request with payment proof
      const retryResponse = await globalThis.fetch(input, {
        ...init,
        headers: {
          ...((init?.headers as Record<string, string>) || {}),
          "X-Payment-Proof": JSON.stringify({
            signature,
            payer: signerAddress,
            facilitator,
          }),
        },
      });

      // Record the payment
      tracker.recordPayment(url, amountUSD);
      console.log(`[x402] Payment of $${amountUSD} for ${url}`);

      return retryResponse;
    } catch (error) {
      console.error("[x402] Payment signing failed:", error);
      return response;
    }
  };

  return {
    fetch: x402Fetch,
    getPaymentRecords: () => tracker.getRecords(),
    getDailySpendUSD: () => tracker.getDailySpendUSD(),
    resetDailySpend: () => tracker.reset(),
  };
}
