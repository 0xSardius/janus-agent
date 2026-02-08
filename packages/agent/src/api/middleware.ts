import type { IncomingMessage, ServerResponse } from "http";
import { API_CONFIG } from "../constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface X402GatingConfig {
  pricePerRequestUSD?: number;
  enableGating?: boolean;
  verifyPayment?: (proof: string) => Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════════════════
// x402 PAYMENT VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify x402 payment proof from request headers.
 * Returns true if payment is valid or gating is disabled.
 */
export async function verifyX402Payment(
  req: IncomingMessage,
  config: X402GatingConfig
): Promise<boolean> {
  // If gating is disabled, always allow
  if (!config.enableGating) return true;

  const proofHeader = req.headers["x-payment-proof"];
  if (!proofHeader) return false;

  const proof = Array.isArray(proofHeader) ? proofHeader[0] : proofHeader;

  // Use custom verifier if provided
  if (config.verifyPayment) {
    return config.verifyPayment(proof);
  }

  // Default: check that proof is valid JSON with required fields
  try {
    const parsed = JSON.parse(proof);
    return !!(parsed.signature && parsed.payer);
  } catch {
    return false;
  }
}

/**
 * Send a 402 Payment Required response with payment details.
 */
export function send402Response(
  res: ServerResponse,
  config: X402GatingConfig
): void {
  const price = config.pricePerRequestUSD ?? API_CONFIG.pricePerRequestUSD;

  res.writeHead(402, {
    "Content-Type": "application/json",
    "X-Payment-Required": JSON.stringify({
      amount: price.toString(),
      currency: "USD",
      network: "base",
      protocol: "x402",
    }),
  });
  res.end(JSON.stringify({
    error: "Payment Required",
    message: `This endpoint requires a payment of $${price} via x402`,
    price: price,
  }));
}
