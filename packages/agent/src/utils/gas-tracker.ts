// ═══════════════════════════════════════════════════════════════════════════
// GAS TRACKER
// Tracks daily gas expenditure for safety limits
// ═══════════════════════════════════════════════════════════════════════════

export interface GasRecord {
  txHash: string;
  gasUsed: bigint;
  timestamp: number;
}

export class GasTracker {
  private records: GasRecord[] = [];
  private lastResetDate: string = "";

  /**
   * Record gas used by a transaction.
   */
  recordGasUsed(txHash: string, gasUsed: bigint): void {
    this.records.push({
      txHash,
      gasUsed,
      timestamp: Date.now(),
    });
  }

  /**
   * Get total gas spent today (UTC).
   */
  getTodayGasSpent(): bigint {
    const todayStart = getUTCDayStart();
    return this.records
      .filter((r) => r.timestamp >= todayStart)
      .reduce((sum, r) => sum + r.gasUsed, BigInt(0));
  }

  /**
   * Reset daily records. Removes records older than today.
   */
  resetDaily(): void {
    const today = getUTCDateString();
    if (this.lastResetDate === today) return;

    const todayStart = getUTCDayStart();
    this.records = this.records.filter((r) => r.timestamp >= todayStart);
    this.lastResetDate = today;
  }

  /**
   * Get all records (for persistence).
   */
  getRecords(): GasRecord[] {
    return [...this.records];
  }

  /**
   * Load records from persistence.
   */
  loadRecords(records: GasRecord[]): void {
    this.records = [...records];
  }

  /**
   * Get record count for today.
   */
  getTodayRecordCount(): number {
    const todayStart = getUTCDayStart();
    return this.records.filter((r) => r.timestamp >= todayStart).length;
  }
}

/**
 * Extract gas cost from a transaction receipt.
 * Returns gasUsed * effectiveGasPrice in wei.
 */
export function estimateGasFromReceipt(receipt: {
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}): bigint {
  return receipt.gasUsed * receipt.effectiveGasPrice;
}

function getUTCDayStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function getUTCDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
