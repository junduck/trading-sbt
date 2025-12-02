import Database from "better-sqlite3";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";
import { toDate } from "../utils.js";

/**
 * SQLite implementation of ReplayDataSource.
 */
export class SQLiteReplayDataSource extends ReplayDataSource {
  private readonly db: Database.Database;
  private readonly epochsStmt: Database.Statement;
  private readonly batchStmt: Database.Statement;

  constructor(
    id: string,
    config: DataSourceConfig,
    table: string,
    symbols: string[]
  ) {
    if (config.type !== "sqlite") {
      throw new Error(`Expected SQLite config, got ${config.type}`);
    }

    super(id, config, table, symbols);

    this.db = new Database(config.filePath, { readonly: true });

    // Prepare epochs query
    this.epochsStmt = this.db.prepare(`
      SELECT DISTINCT ${this.rep.epochColumn}
      FROM ${this.table}
      WHERE ${this.rep.epochColumn} >= ? AND ${this.rep.epochColumn} <= ?
      ORDER BY ${this.rep.epochColumn} ASC
    `);

    // Prepare batch query with optional symbol filter
    let batchQuery = `
      SELECT *
      FROM ${this.table}
      WHERE ${this.rep.epochColumn} = ?
    `;

    if (symbols.length > 0) {
      const placeholders = symbols.map(() => "?").join(", ");
      batchQuery += ` AND ${this.rep.symbolColumn} IN (${placeholders})`;
    }

    batchQuery += ` ORDER BY ${this.rep.symbolColumn} ASC`;

    this.batchStmt = this.db.prepare(batchQuery);
  }

  async getEpochs(from: Date, to: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(from);
    const toEpoch = this.dateToEpoch(to);
    return this.epochsStmt.pluck().all(fromEpoch, toEpoch) as number[];
  }

  async getBatchByEpoch(epoch: number): Promise<MarketQuote[]> {
    const params: (number | string)[] = [epoch];

    if (this.symbols && this.symbols.length > 0) {
      params.push(...this.symbols);
    }

    const rows = this.batchStmt.all(...params) as Array<Record<string, any>>;

    return rows.map((row) => {
      const symbol = row[this.rep.symbolColumn];
      const timestamp = toDate(row[this.rep.epochColumn], this.rep);
      const price = row[this.rep.priceColumn];

      return {
        ...row,
        symbol: typeof symbol === "string" ? symbol : String(symbol),
        timestamp,
        price: typeof price === "number" ? price : Number(price),
      };
    }) as MarketQuote[];
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /**
   * Get database instance for raw queries (for advanced use cases).
   */
  getDb(): Database.Database {
    return this.db;
  }
}
