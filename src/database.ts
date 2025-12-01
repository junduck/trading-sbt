import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { MarketQuote } from "@junduck/trading-core/trading";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OHLCVRow {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  datetime_str: string;
}

/**
 * Database connection for market data.
 * Points to fixtures/cn_data.db for development/testing.
 */
export class MarketDatabase {
  private readonly db: Database.Database;
  private readonly timestampsStmt: Database.Statement;
  private readonly batchStmt: Database.Statement;
  private readonly symbols: string[] | undefined;

  constructor(dbPath?: string, symbols?: string[]) {
    const path = dbPath ?? join(__dirname, "..", "fixtures", "cn_data.db");
    this.db = new Database(path, { readonly: true });
    this.symbols = symbols ?? undefined;

    this.timestampsStmt = this.db.prepare(`
      SELECT DISTINCT timestamp
      FROM ohlcv_5m
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    // Prepare batch statement with optional symbol filter
    let batchQuery = `
      SELECT symbol, timestamp, open, high, low, close, volume, turnover, datetime_str
      FROM ohlcv_5m
      WHERE timestamp = ?
    `;

    if (symbols && symbols.length > 0) {
      const placeholders = symbols.map(() => "?").join(", ");
      batchQuery += ` AND symbol IN (${placeholders})`;
    }

    batchQuery += " ORDER BY symbol ASC";

    this.batchStmt = this.db.prepare(batchQuery);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Get database instance for raw queries.
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Get unique timestamps within a range (epoch seconds).
   */
  getTimestamps(fromEpoch: number, toEpoch: number): number[] {
    return this.timestampsStmt.pluck().all(fromEpoch, toEpoch) as number[];
  }

  /**
   * Get OHLCV data for a specific timestamp, filtered by symbols if provided in constructor.
   */
  getBatchByTimestamp(timestamp: number): MarketQuote[] {
    const params: (number | string)[] = [timestamp];

    if (this.symbols && this.symbols.length > 0) {
      params.push(...this.symbols);
    }

    const rows = this.batchStmt.all(...params) as OHLCVRow[];

    return rows.map((row) => ({
      symbol: row.symbol,
      timestamp: new Date(row.timestamp * 1000),
      price: row.close,
      bid: row.close,
      ask: row.close,
      last: row.close,
      volume: row.volume,
    }));
  }

  /**
   * Generator for replay data streaming.
   * Symbols filter is set in constructor.
   */
  *replayData(
    fromEpoch: number,
    toEpoch: number
  ): Generator<{ timestamp: number; data: MarketQuote[] }> {
    const timestamps = this.getTimestamps(fromEpoch, toEpoch);

    for (const timestamp of timestamps) {
      const data = this.getBatchByTimestamp(timestamp);
      yield { timestamp, data };
    }
  }
}
