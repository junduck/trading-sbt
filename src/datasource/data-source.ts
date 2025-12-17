import type { TableInfo } from "../shared/types.js";

// Config schema from generic-datasource.schema.ts

export interface DataRow {
  symbol: string;
  timestamp: Date;
  [key: string]: unknown;
}

export abstract class DataSource {
  // Ctor: connect to datasource from config

  // Get info about all available tables in the datasource
  abstract getTableInfo(): Promise<TableInfo[]>;

  // Retrieve data iterator for specified table, symbols, and time range
  abstract loadTable(
    table: string,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ): Promise<DataIterator>;

  // Close datasource connections, cleanup resources
  abstract close(): Promise<void>;
}

export abstract class DataIterator implements AsyncIterable<DataRow[]> {
  // Retrieve next batch of data rows, batch -> all rows at a specific epoch time
  abstract nextBatch(): Promise<DataRow[]>;

  async next(): Promise<IteratorResult<DataRow[]>> {
    const value = await this.nextBatch();
    if (value.length === 0) {
      return { done: true, value: undefined };
    }
    return { done: false, value };
  }

  [Symbol.asyncIterator](): AsyncIterator<DataRow[]> {
    return this;
  }
}
