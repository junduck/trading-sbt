import pg from "pg";
import mysql from "mysql2/promise";
import type {
  PostgresConfig,
  MySQLConfig,
} from "../schema/data-source.schema.js";

export type PoolType = pg.Pool | mysql.Pool | undefined;

export function initializePool(config: PostgresConfig | MySQLConfig): PoolType {
  try {
    if (config.type === "postgres") {
      const poolConfig: pg.PoolConfig = {
        database: config.database,
      };

      if (config.conn === "tcp") {
        poolConfig.host = config.host;
        poolConfig.port = config.port;
        poolConfig.ssl = config.ssl;
      } else {
        poolConfig.host = config.socketPath;
      }

      poolConfig.user = config.username;
      poolConfig.password = config.password;

      return new pg.Pool(poolConfig);
    }

    if (config.type === "mysql") {
      const poolConfig: mysql.PoolOptions = {
        database: config.database,
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

      poolConfig.user = config.username;
      if (config.password) {
        poolConfig.password = config.password;
      }

      return mysql.createPool(poolConfig);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function finalizePool(pool: PoolType): Promise<void> {
  if (!pool) return;

  if ("end" in pool) {
    await pool.end();
  }
}
