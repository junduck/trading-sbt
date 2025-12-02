import pg from "pg";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";
import { toDate } from "../utils.js";

/**
 * PostgreSQL implementation of ReplayDataSource.
 */
export class PostgresReplayDataSource extends ReplayDataSource {
  private readonly pool: pg.Pool;
  private fullTable!: string;

  private constructor(
    config: DataSourceConfig,
    pool: pg.Pool,
    symbols?: string[],
    table?: string
  ) {
    if (config.type !== "postgres") {
      throw new Error(`Expected PostgreSQL config, got ${config.type}`);
    }

    super(config, symbols, table);
    this.pool = pool;
  }

  /**
   * Create and initialize a PostgreSQL datasource.
   * Uses shared connection pool for efficiency.
   */
  static async create(
    config: DataSourceConfig,
    pool: pg.Pool,
    symbols?: string[],
    table?: string
  ): Promise<PostgresReplayDataSource> {
    const instance = new PostgresReplayDataSource(config, pool, symbols, table);
    await instance.initialize();

    if (instance.config.type !== "postgres") {
      throw new Error("Invalid config type");
    }

    // Set full table name with schema
    instance.fullTable = `${instance.config.schema}.${instance.table}`;

    return instance;
  }

  protected async getDefaultTable(): Promise<string> {
    const tables = await this.availTables();
    if (tables.length === 0) {
      throw new Error("No tables found in PostgreSQL database");
    }
    return tables[0]!;
  }

  async availTables(): Promise<string[]> {
    if (this.config.type !== "postgres") {
      throw new Error("Invalid config type");
    }

    const result = await this.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
      [this.config.schema]
    );

    return result.rows.map((row) => row.tablename);
  }

  async getEpochs(from: Date, to: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(from);
    const toEpoch = this.dateToEpoch(to);

    const query = `
      SELECT DISTINCT ${this.rep.epochColumn}
      FROM ${this.fullTable}
      WHERE ${this.rep.epochColumn} >= $1 AND ${this.rep.epochColumn} <= $2
      ORDER BY ${this.rep.epochColumn} ASC
    `;

    const result = await this.pool.query(query, [fromEpoch, toEpoch]);
    return result.rows.map((row) => row[this.rep.epochColumn] as number);
  }

  async getBatchByEpoch(epoch: number): Promise<MarketQuote[]> {
    let query = `
      SELECT *
      FROM ${this.fullTable}
      WHERE ${this.rep.epochColumn} = $1
    `;

    const params: (number | string)[] = [epoch];

    if (this.symbols && this.symbols.length > 0) {
      // Build $2, $3, $4, ... placeholders
      const placeholders = this.symbols
        .map((_, i) => `$${i + 2}`)
        .join(", ");
      query += ` AND ${this.rep.symbolColumn} IN (${placeholders})`;
      params.push(...this.symbols);
    }

    query += ` ORDER BY ${this.rep.symbolColumn} ASC`;

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => {
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
    // Pool is shared, so we don't close it here
    // The server will close it on shutdown
  }

  /**
   * Get pool instance for raw queries (for advanced use cases).
   */
  getPool(): pg.Pool {
    return this.pool;
  }
}
