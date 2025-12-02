import type { DataSourceConfig } from "../schema/data-source.schema.js";
import type { ReplayDataSource } from "./replay-datasource.js";
import { SQLiteReplayDataSource } from "./sqlite-datasource.js";
import { PostgresReplayDataSource } from "./postgres-datasource.js";

/**
 * Factory function to create the appropriate ReplayDataSource instance based on config type.
 */
export async function createDataSource(
  config: DataSourceConfig,
  symbols?: string[],
  table?: string
): Promise<ReplayDataSource> {
  switch (config.type) {
    case "sqlite":
      return await SQLiteReplayDataSource.create(config, symbols, table);
    case "postgres":
      return await PostgresReplayDataSource.create(config, symbols, table);
    case "mysql":
      throw new Error("MySQL data source not implemented yet");
    case "csv":
      throw new Error("CSV data source not implemented yet");
    case "json":
      throw new Error("JSON data source not implemented yet");
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown data source type: ${(_exhaustive as any).type}`);
    }
  }
}
