/**
 * Quick wallet check — initializes wallet, prints address + balance, exits.
 * Run: cd packages/agent && node --env-file=../../.env --import tsx src/check-wallet.ts
 *
 * Supports both wallet modes:
 *   - WALLET_PRIVATE_KEY: Local viem wallet (recommended, no API deps)
 *   - CDP_API_KEY_NAME + CDP_API_KEY_PRIVATE: CDP Server Wallet
 */
import { initializeAgentWallet, createViemClients, testWalletConnection } from "./wallet/provider.js";
import { checkWalletReadiness, estimateRequiredFunding } from "./wallet/funding-guide.js";
import { formatEther } from "viem";

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Janus Agent — Wallet Check");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Initialize wallet (auto-detects mode from env vars)
  console.log("Initializing wallet...");
  const { walletProvider } = await initializeAgentWallet();
  const { publicClient, walletClient, walletAddress } = await createViemClients(walletProvider);

  console.log(`\n  WALLET ADDRESS: ${walletAddress}`);
  console.log(`  Network: Base Mainnet (chain ID 8453)`);

  // 2. Test connection
  console.log("\nTesting connection...");
  const connection = await testWalletConnection(walletProvider, publicClient);
  if (!connection.connected) {
    console.error(`Connection failed: ${connection.error}`);
    process.exit(1);
  }
  console.log(`Connected to chain ID ${connection.chainId}`);

  // 3. Read balances
  const ethBalance = await publicClient.getBalance({ address: walletAddress });
  console.log(`\nETH Balance: ${formatEther(ethBalance)} ETH`);

  // 4. Wallet readiness
  const readiness = await checkWalletReadiness(publicClient, walletAddress);
  if (readiness.isReady) {
    console.log(`Wallet is funded and ready to operate`);
  } else {
    console.log(`\nWallet not ready:`);
    for (const issue of readiness.issues) {
      console.log(`   - ${issue}`);
    }
    console.log(`\nRecommendations:`);
    for (const rec of readiness.recommendations) {
      console.log(`   -> ${rec}`);
    }
  }

  // 5. Funding estimate
  const ethPrice = 1973;
  const funding = estimateRequiredFunding(ethPrice);
  console.log(`\nBudget Breakdown ($100 experiment @ $${ethPrice}/ETH):`);
  console.log(`   Gas reserve:      ${funding.gasReserveETH.toFixed(4)} ETH (~$25)`);
  console.log(`   Position capital: ${funding.positionCapitalETH.toFixed(4)} ETH (~$40)`);
  console.log(`   Operating buffer: ${funding.operatingBufferETH.toFixed(4)} ETH (~$25)`);
  console.log(`   Emergency reserve: ${funding.emergencyReserveETH.toFixed(4)} ETH (~$10)`);
  console.log(`   ─────────────────────────────────`);
  console.log(`   TOTAL NEEDED:     ${funding.totalRequiredETH.toFixed(4)} ETH`);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Send ETH on Base to: ${walletAddress}`);
  console.log(`═══════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
