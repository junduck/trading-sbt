import type { MarketQuote } from "@junduck/trading-core/trading";
import type {
  DataSourceConfig,
  DataRep,
} from "../schema/data-source.schema.js";
import { toEpoch } from "../utils.js";

/**
 * Abstract base class for replay data sources.
 * Handles time conversions and provides unified interface for different data source types.
 */
export abstract class ReplayDataSource {
  protected readonly config: DataSourceConfig;
  protected readonly rep: DataRep;
  protected readonly symbols: string[];
  protected readonly table: string;
  protected readonly replayId: string;

  constructor(
    id: string,
    config: DataSourceConfig,
    table: string,
    symbols: string[]
  ) {
    this.config = config;
    this.rep = config.mapping;
    this.table = table;
    this.symbols = symbols;
    this.replayId = id;
  }

  /**
   * Get unique epoch timestamps within a date range.
   * Returns number[] for efficiency, but accepts Date parameters.
   */
  abstract getEpochs(from: Date, to: Date): Promise<number[]>;

  /**
   * Get batch data for a specific epoch timestamp.
   */
  abstract getBatchByEpoch(epoch: number): Promise<MarketQuote[]>;

  /**
   * Async generator for replay data streaming.
   * Yields {timestamp: Date, data: MarketQuote[]} - caller doesn't handle epoch conversion.
   */
  async *replayData(
    from: Date,
    to: Date
  ): AsyncGenerator<{ timestamp: Date; data: MarketQuote[] }> {
    const epochs = await this.getEpochs(from, to);

    for (const epoch of epochs) {
      const data = await this.getBatchByEpoch(epoch);
      // Convert epoch back to Date for caller
      const timestamp = this.epochToDate(epoch);
      yield { timestamp, data };
    }
  }

  /**
   * Convert Date to epoch number using DataRep configuration.
   */
  protected dateToEpoch(date: Date): number {
    return toEpoch(date, this.rep);
  }

  /**
   * Convert epoch number to Date using DataRep configuration.
   */
  protected epochToDate(epoch: number): Date {
    switch (this.rep.epochUnit) {
      case "s":
        return new Date(epoch * 1000);
      case "ms":
        return new Date(epoch);
      case "us":
        return new Date(epoch / 1000);
    }
  }

  /**
   * Close/cleanup the data source connection.
   */
  abstract close(): Promise<void>;
}
