import pg from "pg";
import type { MarketQuote } from "@junduck/trading-core/trading";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import { ReplayDataSource } from "./replay-datasource.js";

/**
 * PostgreSQL implementation of ReplayDataSource.
 */
export class PostgresReplayDataSource extends ReplayDataSource {
  private readonly pool: pg.Pool;
  private readonly fullTable: string;

  constructor(
    id: string,
    config: DataSourceConfig,
    pool: pg.Pool,
    table: string,
    symbols: string[]
  ) {
    if (config.type !== "postgres") {
      throw new Error(`Expected PostgreSQL config, got ${config.type}`);
    }

    super(id, config, table, symbols);
    this.pool = pool;
    this.fullTable = `${config.schema}.${table}`;
  }

  async getEpochs(from: Date, to: Date): Promise<number[]> {
    const fromEpoch = this.dateToEpoch(from);
    const toEpoch = this.dateToEpoch(to);

    const result = await this.pool.query({
      name: `${this.replayId}_get_epochs`,
      text: `
        SELECT DISTINCT ${this.rep.epochColumn}
        FROM ${this.fullTable}
        WHERE ${this.rep.epochColumn} >= $1 AND ${this.rep.epochColumn} <= $2
        ORDER BY ${this.rep.epochColumn} ASC
      `,
      values: [fromEpoch, toEpoch],
    });

    return result.rows.map((row) => row[this.rep.epochColumn] as number);
  }

  async getBatchByEpoch(epoch: number): Promise<MarketQuote[]> {
    let result;

    if (this.symbols && this.symbols.length > 0) {
      // Prepared statement with symbol filtering
      result = await this.pool.query({
        name: `${this.replayId}_get_batch_with_symbols`,
        text: `
          SELECT *
          FROM ${this.fullTable}
          WHERE ${this.rep.epochColumn} = $1
            AND ${this.rep.symbolColumn} = ANY($2::text[])
          ORDER BY ${this.rep.symbolColumn} ASC
        `,
        values: [epoch, this.symbols],
      });
    } else {
      // Prepared statement without symbol filtering
      result = await this.pool.query({
        name: `${this.replayId}_get_batch_all_symbols`,
        text: `
          SELECT *
          FROM ${this.fullTable}
          WHERE ${this.rep.epochColumn} = $1
          ORDER BY ${this.rep.symbolColumn} ASC
        `,
        values: [epoch],
      });
    }

    return result.rows.map((row) => {
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
  getPool(): pg.Pool {
    return this.pool;
  }
}
