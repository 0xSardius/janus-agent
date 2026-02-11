import { describe, it, expect } from "vitest";
import {
  encodeEventTopics,
  encodeAbiParameters,
  type Address,
  type Log,
} from "viem";
import {
  parseSwapReceiptForTokens,
  parseSwapReceiptForETH,
} from "./receipt-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// ABI FRAGMENTS (for encoding test data)
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_TRANSFER_ABI = [
  {
    type: "event" as const,
    name: "Transfer" as const,
    inputs: [
      { name: "from" as const, type: "address" as const, indexed: true as const },
      { name: "to" as const, type: "address" as const, indexed: true as const },
      { name: "value" as const, type: "uint256" as const, indexed: false as const },
    ],
  },
] as const;

const WETH_WITHDRAWAL_ABI = [
  {
    type: "event" as const,
    name: "Withdrawal" as const,
    inputs: [
      { name: "src" as const, type: "address" as const, indexed: true as const },
      { name: "wad" as const, type: "uint256" as const, indexed: false as const },
    ],
  },
] as const;

// Valid hex addresses
const TOKEN_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678" as Address;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const AGENT_ADDRESS = "0xABCDabcdABcDabcDaBCDAbcdABcdAbCdABcDABCd" as Address;
const OTHER_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

function makeTransferLog(
  contractAddress: Address,
  from: Address,
  to: Address,
  value: bigint
): Log {
  const topics = encodeEventTopics({
    abi: ERC20_TRANSFER_ABI,
    eventName: "Transfer",
    args: { from, to },
  }) as [`0x${string}`, ...`0x${string}`[]];

  const data = encodeAbiParameters(
    [{ type: "uint256" }],
    [value]
  );

  return {
    address: contractAddress,
    topics,
    data,
    blockHash: ZERO_HASH,
    blockNumber: BigInt(1),
    transactionHash: ZERO_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

function makeWithdrawalLog(src: Address, wad: bigint): Log {
  const topics = encodeEventTopics({
    abi: WETH_WITHDRAWAL_ABI,
    eventName: "Withdrawal",
    args: { src },
  }) as [`0x${string}`, ...`0x${string}`[]];

  const data = encodeAbiParameters(
    [{ type: "uint256" }],
    [wad]
  );

  return {
    address: WETH_ADDRESS,
    topics,
    data,
    blockHash: ZERO_HASH,
    blockNumber: BigInt(1),
    transactionHash: ZERO_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

describe("parseSwapReceiptForTokens", () => {
  it("parses ERC-20 Transfer to get tokens received", () => {
    const logs = [
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(1000000)),
    ];

    const result = parseSwapReceiptForTokens(
      { logs },
      TOKEN_ADDRESS,
      AGENT_ADDRESS
    );
    expect(result).toBe(BigInt(1000000));
  });

  it("sums multiple transfers to recipient", () => {
    const logs = [
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(500)),
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(300)),
    ];

    const result = parseSwapReceiptForTokens(
      { logs },
      TOKEN_ADDRESS,
      AGENT_ADDRESS
    );
    expect(result).toBe(BigInt(800));
  });

  it("ignores transfers from other contracts", () => {
    const otherToken = "0xdEaD000000000000000000000000000000000000" as Address;
    const logs = [
      makeTransferLog(otherToken, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(999)),
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(100)),
    ];

    const result = parseSwapReceiptForTokens(
      { logs },
      TOKEN_ADDRESS,
      AGENT_ADDRESS
    );
    expect(result).toBe(BigInt(100));
  });

  it("ignores transfers to other addresses when recipient specified", () => {
    const logs = [
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, OTHER_ADDRESS, BigInt(999)),
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(100)),
    ];

    const result = parseSwapReceiptForTokens(
      { logs },
      TOKEN_ADDRESS,
      AGENT_ADDRESS
    );
    expect(result).toBe(BigInt(100));
  });

  it("returns zero for empty logs", () => {
    const result = parseSwapReceiptForTokens({ logs: [] }, TOKEN_ADDRESS);
    expect(result).toBe(BigInt(0));
  });

  it("counts all transfers when no recipient specified", () => {
    const logs = [
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(100)),
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, OTHER_ADDRESS, BigInt(200)),
    ];

    const result = parseSwapReceiptForTokens({ logs }, TOKEN_ADDRESS);
    expect(result).toBe(BigInt(300));
  });
});

describe("parseSwapReceiptForETH", () => {
  it("parses WETH Transfer to get ETH received", () => {
    const logs = [
      makeTransferLog(WETH_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(3000000000000000)),
    ];

    const result = parseSwapReceiptForETH({ logs }, AGENT_ADDRESS);
    expect(result).toBe(BigInt(3000000000000000));
  });

  it("parses WETH Withdrawal event", () => {
    const logs = [makeWithdrawalLog(AGENT_ADDRESS, BigInt(5000000000000000))];

    const result = parseSwapReceiptForETH({ logs });
    expect(result).toBe(BigInt(5000000000000000));
  });

  it("ignores non-WETH transfers", () => {
    const logs = [
      makeTransferLog(TOKEN_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(999)),
    ];

    const result = parseSwapReceiptForETH({ logs }, AGENT_ADDRESS);
    expect(result).toBe(BigInt(0));
  });

  it("returns zero for empty logs", () => {
    const result = parseSwapReceiptForETH({ logs: [] });
    expect(result).toBe(BigInt(0));
  });

  it("sums WETH transfers and withdrawals", () => {
    const logs = [
      makeTransferLog(WETH_ADDRESS, OTHER_ADDRESS, AGENT_ADDRESS, BigInt(1000)),
      makeWithdrawalLog(AGENT_ADDRESS, BigInt(2000)),
    ];

    const result = parseSwapReceiptForETH({ logs }, AGENT_ADDRESS);
    expect(result).toBe(BigInt(3000));
  });
});
