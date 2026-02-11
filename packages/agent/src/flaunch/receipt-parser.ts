import { decodeEventLog, type Log, type Address } from "viem";

// ═══════════════════════════════════════════════════════════════════════════
// ABI FRAGMENTS FOR EVENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

// ERC-20 Transfer event
const ERC20_TRANSFER_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// WETH Withdrawal event
const WETH_WITHDRAWAL_ABI = [
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { name: "src", type: "address", indexed: true },
      { name: "wad", type: "uint256", indexed: false },
    ],
  },
] as const;

// WETH on Base
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;

// ═══════════════════════════════════════════════════════════════════════════
// RECEIPT PARSERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a swap receipt to find how many tokens were received.
 * Looks for ERC-20 Transfer events from the token contract to the recipient.
 */
export function parseSwapReceiptForTokens(
  receipt: { logs: readonly Log[] },
  tokenAddress: Address,
  recipientAddress?: Address
): bigint {
  const normalizedToken = tokenAddress.toLowerCase();
  let totalReceived = BigInt(0);

  for (const log of receipt.logs) {
    // Only look at logs from the token contract
    if (log.address?.toLowerCase() !== normalizedToken) continue;

    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "Transfer") {
        const { to, value } = decoded.args;
        // If recipientAddress specified, only count transfers to that address
        if (
          !recipientAddress ||
          to.toLowerCase() === recipientAddress.toLowerCase()
        ) {
          totalReceived += value;
        }
      }
    } catch {
      // Not a Transfer event, skip
      continue;
    }
  }

  return totalReceived;
}

/**
 * Parse a swap receipt to find how much ETH was received.
 * Looks for WETH Transfer events to the recipient, or WETH Withdrawal events.
 */
export function parseSwapReceiptForETH(
  receipt: { logs: readonly Log[] },
  recipientAddress?: Address
): bigint {
  const normalizedWETH = WETH_ADDRESS.toLowerCase();
  let totalReceived = BigInt(0);

  for (const log of receipt.logs) {
    // Only look at WETH logs
    if (log.address?.toLowerCase() !== normalizedWETH) continue;

    // Try Transfer event first (WETH sent to recipient)
    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "Transfer") {
        const { to, value } = decoded.args;
        if (
          !recipientAddress ||
          to.toLowerCase() === recipientAddress.toLowerCase()
        ) {
          totalReceived += value;
        }
        continue;
      }
    } catch {
      // Not a Transfer, try Withdrawal
    }

    // Try Withdrawal event (WETH → ETH unwrap)
    try {
      const decoded = decodeEventLog({
        abi: WETH_WITHDRAWAL_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "Withdrawal") {
        totalReceived += decoded.args.wad;
      }
    } catch {
      // Not a Withdrawal either, skip
      continue;
    }
  }

  return totalReceived;
}
