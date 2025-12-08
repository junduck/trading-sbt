import Database from "better-sqlite3";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";

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

  async getEpochs(startTime: Date, endTime: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(startTime);
    const toEpoch = this.dateToEpoch(endTime);
    return this.epochsStmt.pluck().all(fromEpoch, toEpoch) as number[];
  }

  async getBatchByEpoch(epoch: number): Promise<MarketQuote[]> {
    const params: (number | string)[] = [epoch];

    if (this.symbols && this.symbols.length > 0) {
      params.push(...this.symbols);
    }

    const rows = this.batchStmt.all(...params) as Array<Record<string, any>>;

    return rows.map((row) => {
      const timestamp = this.epochToDate(row[this.rep.epochColumn]);
      return {
        ...row,
        symbol: row[this.rep.symbolColumn],
        price: row[this.rep.priceColumn],
        timestamp,
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
