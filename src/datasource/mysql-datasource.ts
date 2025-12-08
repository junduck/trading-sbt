import mysql from "mysql2/promise";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";

/**
 * MySQL/MariaDB implementation of ReplayDataSource.
 */
export class MySQLReplayDataSource extends ReplayDataSource {
  private readonly pool: mysql.Pool;

  constructor(
    id: string,
    config: DataSourceConfig,
    pool: mysql.Pool,
    table: string,
    symbols: string[]
  ) {
    if (config.type !== "mysql") {
      throw new Error(`Expected MySQL config, got ${config.type}`);
    }

    super(id, config, table, symbols);
    this.pool = pool;
  }

  async getEpochs(startTime: Date, endTime: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(startTime);
    const toEpoch = this.dateToEpoch(endTime);

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
