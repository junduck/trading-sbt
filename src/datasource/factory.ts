import pg from "pg";
import mysql from "mysql2/promise";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import type { ReplayDataSource } from "./replay-datasource.js";
import { SQLiteReplayDataSource } from "./sqlite-datasource.js";
import { PostgresReplayDataSource } from "./postgres-datasource.js";
import { MySQLReplayDataSource } from "./mysql-datasource.js";

/**
 * Union type for database connection pools.
 * SQLite doesn't use pools, so undefined for that case.
 */
export type DataSourcePool = pg.Pool | mysql.Pool | undefined;

/**
 * Initialize a shared connection pool for the datasource.
 * Call this once at server startup and pass the pool to createDataSource.
 */
export function initializePool(config: DataSourceConfig): DataSourcePool {
  switch (config.type) {
    case "sqlite":
      // SQLite doesn't use connection pools
      return undefined;

    case "postgres": {
      const poolConfig: pg.PoolConfig = {
        database: config.database,
        user: config.username,
        password: config.password,
      };

      if (config.conn === "tcp") {
        poolConfig.host = config.host;
        poolConfig.port = config.port;
        poolConfig.ssl = config.ssl ? { rejectUnauthorized: false } : false;
      } else {
        poolConfig.host = config.socketPath;
      }

      return new pg.Pool(poolConfig);
    }

    case "mysql": {
      const poolConfig: mysql.PoolOptions = {
        database: config.database,
        user: config.username,
        ...(config.password && { password: config.password }),
      };

      if (config.conn === "tcp") {
        poolConfig.host = config.host;
        poolConfig.port = config.port;
        if (config.ssl) {
          poolConfig.ssl = {};
        }
      } else {
        poolConfig.socketPath = config.socketPath;
      }

      return mysql.createPool(poolConfig);
    }

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

/**
 * Close the shared connection pool.
 * Call this at server shutdown.
 */
export async function closePool(pool: DataSourcePool): Promise<void> {
  if (!pool) {
    // SQLite doesn't have a pool
    return;
  }

  if ('end' in pool) {
    await pool.end();
  }
}

/**
 * Factory function to create the appropriate ReplayDataSource instance.
 * Pass the shared pool from initializePool for efficient resource usage.
 */
export async function createDataSource(
  config: DataSourceConfig,
  pool: DataSourcePool,
  symbols?: string[],
  table?: string
): Promise<ReplayDataSource> {
  switch (config.type) {
    case "sqlite":
      return await SQLiteReplayDataSource.create(config, undefined, symbols, table);
    case "postgres":
      return await PostgresReplayDataSource.create(config, pool as pg.Pool, symbols, table);
    case "mysql":
      return await MySQLReplayDataSource.create(config, pool as mysql.Pool, symbols, table);
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
