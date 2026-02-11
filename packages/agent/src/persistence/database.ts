import Database from "better-sqlite3";

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize SQLite database with schema migrations.
 * Pass `:memory:` for in-memory DB (testing).
 */
export function initDatabase(dbPath: string = "./janus.db"): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      token_address TEXT PRIMARY KEY,
      token_symbol TEXT NOT NULL,
      entry_price_eth TEXT NOT NULL,
      amount_token TEXT NOT NULL,
      cost_basis_eth TEXT NOT NULL,
      bought_at INTEGER NOT NULL,
      tranches_sold INTEGER NOT NULL DEFAULT 0,
      total_sold_eth TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'active',
      concept TEXT
    );

    CREATE TABLE IF NOT EXISTS launched_tokens (
      address TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      launched_at INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      pool_id TEXT
    );

    CREATE TABLE IF NOT EXISTS performance_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      profit_multiple REAL NOT NULL,
      performance_score REAL NOT NULL,
      factor_volume REAL,
      factor_recency REAL,
      factor_social REAL,
      factor_novelty REAL,
      exit_action TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_performance (
      category TEXT PRIMARY KEY,
      total_results INTEGER NOT NULL DEFAULT 0,
      avg_score REAL NOT NULL DEFAULT 0,
      ema_score REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS factor_correlations (
      factor TEXT PRIMARY KEY,
      correlation REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scoring_weights (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      volume REAL NOT NULL,
      recency REAL NOT NULL,
      social REAL NOT NULL,
      novelty REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gas_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL,
      gas_used TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface PositionRow {
  token_address: string;
  token_symbol: string;
  entry_price_eth: string;
  amount_token: string;
  cost_basis_eth: string;
  bought_at: number;
  tranches_sold: number;
  total_sold_eth: string;
  status: string;
  concept: string | null;
}

export function savePosition(db: Database.Database, position: PositionRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO positions
      (token_address, token_symbol, entry_price_eth, amount_token, cost_basis_eth,
       bought_at, tranches_sold, total_sold_eth, status, concept)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    position.token_address,
    position.token_symbol,
    position.entry_price_eth,
    position.amount_token,
    position.cost_basis_eth,
    position.bought_at,
    position.tranches_sold,
    position.total_sold_eth,
    position.status,
    position.concept
  );
}

export function loadActivePositions(db: Database.Database): PositionRow[] {
  return db.prepare(
    "SELECT * FROM positions WHERE status = 'active'"
  ).all() as PositionRow[];
}

export function loadAllPositions(db: Database.Database): PositionRow[] {
  return db.prepare("SELECT * FROM positions").all() as PositionRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCHED TOKEN CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface LaunchedTokenRow {
  address: string;
  token_id: string;
  name: string;
  symbol: string;
  launched_at: number;
  tx_hash: string;
  pool_id: string | null;
}

export function saveLaunchedToken(db: Database.Database, token: LaunchedTokenRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO launched_tokens
      (address, token_id, name, symbol, launched_at, tx_hash, pool_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    token.address,
    token.token_id,
    token.name,
    token.symbol,
    token.launched_at,
    token.tx_hash,
    token.pool_id
  );
}

export function loadLaunchedTokens(db: Database.Database): LaunchedTokenRow[] {
  return db.prepare("SELECT * FROM launched_tokens").all() as LaunchedTokenRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE RESULT CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface PerformanceResultRow {
  concept: string;
  category: string;
  profit_multiple: number;
  performance_score: number;
  factor_volume: number | null;
  factor_recency: number | null;
  factor_social: number | null;
  factor_novelty: number | null;
  exit_action: string;
  timestamp: number;
}

export function savePerformanceResult(
  db: Database.Database,
  result: PerformanceResultRow
): void {
  db.prepare(`
    INSERT INTO performance_results
      (concept, category, profit_multiple, performance_score,
       factor_volume, factor_recency, factor_social, factor_novelty,
       exit_action, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.concept,
    result.category,
    result.profit_multiple,
    result.performance_score,
    result.factor_volume,
    result.factor_recency,
    result.factor_social,
    result.factor_novelty,
    result.exit_action,
    result.timestamp
  );
}

export function loadPerformanceResults(
  db: Database.Database
): PerformanceResultRow[] {
  return db.prepare("SELECT * FROM performance_results ORDER BY timestamp ASC")
    .all() as PerformanceResultRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY PERFORMANCE CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface CategoryPerformanceRow {
  category: string;
  total_results: number;
  avg_score: number;
  ema_score: number;
}

export function saveCategoryPerformance(
  db: Database.Database,
  row: CategoryPerformanceRow
): void {
  db.prepare(`
    INSERT OR REPLACE INTO category_performance
      (category, total_results, avg_score, ema_score)
    VALUES (?, ?, ?, ?)
  `).run(row.category, row.total_results, row.avg_score, row.ema_score);
}

export function loadCategoryPerformance(
  db: Database.Database
): CategoryPerformanceRow[] {
  return db.prepare("SELECT * FROM category_performance")
    .all() as CategoryPerformanceRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTOR CORRELATIONS CRUD
// ═══════════════════════════════════════════════════════════════════════════

export function saveFactorCorrelation(
  db: Database.Database,
  factor: string,
  correlation: number
): void {
  db.prepare(`
    INSERT OR REPLACE INTO factor_correlations (factor, correlation)
    VALUES (?, ?)
  `).run(factor, correlation);
}

export function loadFactorCorrelations(
  db: Database.Database
): Map<string, number> {
  const rows = db.prepare("SELECT * FROM factor_correlations").all() as Array<{
    factor: string;
    correlation: number;
  }>;
  return new Map(rows.map((r) => [r.factor, r.correlation]));
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING WEIGHTS CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringWeightsRow {
  volume: number;
  recency: number;
  social: number;
  novelty: number;
}

export function saveWeights(
  db: Database.Database,
  weights: ScoringWeightsRow
): void {
  db.prepare(`
    INSERT OR REPLACE INTO scoring_weights (id, volume, recency, social, novelty)
    VALUES (1, ?, ?, ?, ?)
  `).run(weights.volume, weights.recency, weights.social, weights.novelty);
}

export function loadWeights(
  db: Database.Database
): ScoringWeightsRow | null {
  const row = db.prepare("SELECT * FROM scoring_weights WHERE id = 1").get() as
    | (ScoringWeightsRow & { id: number })
    | undefined;
  if (!row) return null;
  return {
    volume: row.volume,
    recency: row.recency,
    social: row.social,
    novelty: row.novelty,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT METADATA (key-value store)
// ═══════════════════════════════════════════════════════════════════════════

export function saveMeta(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare(`
    INSERT OR REPLACE INTO agent_metadata (key, value) VALUES (?, ?)
  `).run(key, value);
}

export function loadMeta(
  db: Database.Database,
  key: string
): string | null {
  const row = db.prepare("SELECT value FROM agent_metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAS RECORDS CRUD
// ═══════════════════════════════════════════════════════════════════════════

export interface GasRecordRow {
  tx_hash: string;
  gas_used: string;
  timestamp: number;
}

export function saveGasRecord(
  db: Database.Database,
  record: GasRecordRow
): void {
  db.prepare(`
    INSERT INTO gas_records (tx_hash, gas_used, timestamp) VALUES (?, ?, ?)
  `).run(record.tx_hash, record.gas_used, record.timestamp);
}

export function loadGasRecords(db: Database.Database): GasRecordRow[] {
  return db.prepare("SELECT * FROM gas_records ORDER BY timestamp ASC")
    .all() as GasRecordRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function closeDatabase(db: Database.Database): void {
  db.close();
}
