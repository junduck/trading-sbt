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
  private epochsStmt!: Database.Statement;
  private batchStmt!: Database.Statement;

  private constructor(config: DataSourceConfig, symbols?: string[], table?: string) {
    if (config.type !== "sqlite") {
      throw new Error(`Expected SQLite config, got ${config.type}`);
    }

    super(config, symbols, table);

    this.db = new Database(config.filePath, { readonly: true });
  }

  /**
   * Create and initialize a SQLite datasource.
   */
  static async create(
    config: DataSourceConfig,
    symbols?: string[],
    table?: string
  ): Promise<SQLiteReplayDataSource> {
    const instance = new SQLiteReplayDataSource(config, symbols, table);
    await instance.initialize();

    // Validate table exists
    const availableTables = await instance.availTables();
    if (!availableTables.includes(instance.table)) {
      instance.db.close();
      throw new Error(
        `Table '${instance.table}' not found. Available tables: ${availableTables.join(", ")}`
      );
    }

    // Prepare epochs query
    instance.epochsStmt = instance.db.prepare(`
      SELECT DISTINCT ${instance.rep.epochColumn}
      FROM ${instance.table}
      WHERE ${instance.rep.epochColumn} >= ? AND ${instance.rep.epochColumn} <= ?
      ORDER BY ${instance.rep.epochColumn} ASC
    `);

    // Prepare batch query with optional symbol filter
    let batchQuery = `
      SELECT *
      FROM ${instance.table}
      WHERE ${instance.rep.epochColumn} = ?
    `;

    if (symbols && symbols.length > 0) {
      const placeholders = symbols.map(() => "?").join(", ");
      batchQuery += ` AND ${instance.rep.symbolColumn} IN (${placeholders})`;
    }

    batchQuery += ` ORDER BY ${instance.rep.symbolColumn} ASC`;

    instance.batchStmt = instance.db.prepare(batchQuery);

    return instance;
  }

  protected async getDefaultTable(): Promise<string> {
    const tables = await this.availTables();
    if (tables.length === 0) {
      throw new Error("No tables found in SQLite database");
    }
    return tables[0]!;
  }

  async availTables(): Promise<string[]> {
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .pluck()
      .all() as string[];
    return tables;
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
