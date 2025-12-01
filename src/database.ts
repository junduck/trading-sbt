import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import type { MarketQuote } from "@junduck/trading-core/trading";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DatabaseConfigSchema = z.object({
  dbPath: z.string(),
  price: z.string(),
  timestamp: z.string(),
  epoch: z.enum(["s", "ms"]),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function parseTime(t: any, epoch: "s" | "ms"): Date {
  switch (epoch) {
    case "s":
      return new Date((t as number) * 1000);
    case "ms":
      return new Date(t as number);
  }
}

/**
 * Load database configuration from environment or default location.
 */
function loadConfig(): DatabaseConfig {
  const configPath =
    process.env["SBT_CONFIG"] ?? join(process.cwd(), "config.json");

  if (!existsSync(configPath)) {
    // Default fallback config
    return {
      dbPath: join(__dirname, "..", "fixtures", "cn_data.db"),
      price: "close",
      timestamp: "timestamp",
      epoch: "s",
    };
  }

  const configData = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(configData);
  const config = DatabaseConfigSchema.parse(parsed);

  // Resolve relative dbPath from config file location
  if (!isAbsolute(config.dbPath)) {
    const configDir = dirname(configPath);
    config.dbPath = join(configDir, config.dbPath);
  }

  return config;
}

/**
 * Database connection for market data.
 * Supports dynamic configuration via config.json.
 */
export class MarketDatabase {
  private readonly db: Database.Database;
  private readonly timestampsStmt: Database.Statement;
  private readonly batchStmt: Database.Statement;
  private readonly symbols: string[] | undefined;
  private readonly config: DatabaseConfig;
  private readonly table: string;

  constructor(dbPath?: string, symbols?: string[], table: string = "ohlcv_5m") {
    this.config = loadConfig();
    const path = dbPath ?? this.config.dbPath;
    this.db = new Database(path, { readonly: true });
    this.symbols = symbols ?? undefined;

    // Validate table name against available tables
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .pluck()
      .all() as string[];

    if (!tables.includes(table)) {
      this.db.close();
      throw new Error(
        `Table '${table}' not found. Available tables: ${tables.join(", ")}`
      );
    }

    this.table = table;

    this.timestampsStmt = this.db.prepare(`
      SELECT DISTINCT ${this.config.timestamp}
      FROM ${this.table}
      WHERE ${this.config.timestamp} >= ? AND ${this.config.timestamp} <= ?
      ORDER BY ${this.config.timestamp} ASC
    `);

    // Prepare batch statement with optional symbol filter
    let batchQuery = `
      SELECT *
      FROM ${this.table}
      WHERE ${this.config.timestamp} = ?
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
   * Dynamically maps all columns from database row using config.
   */
  getBatchByTimestamp(timestamp: number): MarketQuote[] {
    const params: (number | string)[] = [timestamp];

    if (this.symbols && this.symbols.length > 0) {
      params.push(...this.symbols);
    }

    const rows = this.batchStmt.all(...params) as Array<Record<string, any>>;

    return rows.map((row) => ({
      ...row,
      timestamp: parseTime(row[this.config.timestamp], this.config.epoch),
      price: row[this.config.price],
    })) as MarketQuote[];
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
