import mysql from "mysql2/promise";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";
import { toDate } from "../utils.js";

/**
 * MySQL/MariaDB implementation of ReplayDataSource.
 */
export class MySQLReplayDataSource extends ReplayDataSource {
  private readonly pool: mysql.Pool;

  private constructor(
    config: DataSourceConfig,
    pool: mysql.Pool,
    symbols?: string[],
    table?: string
  ) {
    if (config.type !== "mysql") {
      throw new Error(`Expected MySQL config, got ${config.type}`);
    }

    super(config, symbols, table);
    this.pool = pool;
  }

  /**
   * Create and initialize a MySQL datasource.
   * Uses shared connection pool for efficiency.
   */
  static async create(
    config: DataSourceConfig,
    pool: mysql.Pool,
    symbols?: string[],
    table?: string
  ): Promise<MySQLReplayDataSource> {
    const instance = new MySQLReplayDataSource(config, pool, symbols, table);
    await instance.initialize();
    return instance;
  }

  protected async getDefaultTable(): Promise<string> {
    const tables = await this.availTables();
    if (tables.length === 0) {
      throw new Error("No tables found in MySQL database");
    }
    return tables[0]!;
  }

  async availTables(): Promise<string[]> {
    if (this.config.type !== "mysql") {
      throw new Error("Invalid config type");
    }

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
      [this.config.database]
    );

    return rows.map((row) => row["table_name"] as string);
  }

  async getEpochs(from: Date, to: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(from);
    const toEpoch = this.dateToEpoch(to);

    const query = `
      SELECT DISTINCT \`${this.table}\`.\`${this.rep.epochColumn}\`
      FROM \`${this.table}\`
      WHERE \`${this.rep.epochColumn}\` >= ? AND \`${this.rep.epochColumn}\` <= ?
      ORDER BY \`${this.rep.epochColumn}\` ASC
    `;

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(query, [
      fromEpoch,
      toEpoch,
    ]);
    return rows.map((row) => row[this.rep.epochColumn] as number);
  }

  async getBatchByEpoch(epoch: number): Promise<MarketQuote[]> {
    let query = `
      SELECT *
      FROM \`${this.table}\`
      WHERE \`${this.rep.epochColumn}\` = ?
    `;

    const params: (number | string)[] = [epoch];

    if (this.symbols && this.symbols.length > 0) {
      const placeholders = this.symbols.map(() => "?").join(", ");
      query += ` AND \`${this.rep.symbolColumn}\` IN (${placeholders})`;
      params.push(...this.symbols);
    }

    query += ` ORDER BY \`${this.rep.symbolColumn}\` ASC`;

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(query, params);

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
    // Pool is shared, so we don't close it here
    // The server will close it on shutdown
  }

  /**
   * Get pool instance for raw queries (for advanced use cases).
   */
  getPool(): mysql.Pool {
    return this.pool;
  }
}
