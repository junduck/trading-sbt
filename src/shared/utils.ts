import type {
  DataRep,
  DataSourceConfig,
} from "../schema/data-source.schema.js";
import mysql from "mysql2/promise";
import pg from "pg";
import Database from "better-sqlite3";
import type { TableInfo } from "./types.js";

export function serverTime(): Date {
  return new Date();
}

/**
 * Convert epoch timestamp to Date based on the unit.
 */
export function toDate(time: number, rep: DataRep): Date {
  switch (rep.epochUnit) {
    case "s":
      return new Date(time * 1000);
    case "ms":
      return new Date(time);
    case "us":
      return new Date(time / 1000);
  }
}

export function toEpoch(date: Date, rep: DataRep): number {
  switch (rep.epochUnit) {
    case "s":
      return Math.floor(date.getTime() / 1000);
    case "ms":
      return date.getTime();
    case "us":
      return date.getTime() * 1000;
  }
}

/**
 * Convert Date to day index since Unix epoch (like R's Date type).
 * @param date - The date to convert
 * @param tzOffset - Timezone offset in minutes (default 480 = UTC+8 Asia/Shanghai)
 * @returns Day index since epoch in the specified timezone, or 0 if before epoch
 */
export function daysSinceEpoch(date: Date, tzOffset: number = 480): number {
  // TODO: config timezone
  const epochSec = date.getTime() / 1000;
  const tzOffsetSec = tzOffset * 60;
  const localSec = epochSec + tzOffsetSec;

  if (localSec < 0) {
    return 0;
  }
  return Math.floor(localSec / 86400);
}

export async function getTableInfo(
  config: DataSourceConfig,
  pool?: any
): Promise<TableInfo[]> {
  switch (config.type) {
    case "mysql":
      const [rows] = await (pool as mysql.Pool).query<mysql.RowDataPacket[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
        [config.database]
      );
      // now query for min/max timestamp for each table
      const tables: TableInfo[] = [];
      for (const row of rows) {
        const tableName = row["table_name"] as string;
        const [minMaxRows] = await (pool as mysql.Pool).query<
          mysql.RowDataPacket[]
        >(
          `SELECT MIN(${config.mapping.epochColumn}) AS min_ts, MAX(${config.mapping.epochColumn}) AS max_ts FROM \`${tableName}\``
        );
        const minTs = minMaxRows[0]!["min_ts"] as number;
        const maxTs = minMaxRows[0]!["max_ts"] as number;
        if (minTs !== null && maxTs !== null) {
          tables.push({
            name: tableName,
            from: toDate(minTs, config.mapping),
            to: toDate(maxTs, config.mapping),
          });
        }
      }
      return tables;
    case "postgres":
      const result = await (pool as pg.Pool).query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
        [config.schema]
      );
      const pgTables: TableInfo[] = [];
      for (const row of result.rows) {
        const tableName = row.tablename;
        const res = await (pool as pg.Pool).query<{
          min_ts: number;
          max_ts: number;
        }>(
          `SELECT MIN(${config.mapping.epochColumn}) AS min_ts, MAX(${config.mapping.epochColumn}) AS max_ts FROM "${tableName}"`
        );
        const minTs = res.rows[0]!["min_ts"];
        const maxTs = res.rows[0]!["max_ts"];
        if (minTs !== null && maxTs !== null) {
          pgTables.push({
            name: tableName,
            from: toDate(minTs, config.mapping),
            to: toDate(maxTs, config.mapping),
          });
        }
      }
      return pgTables;
    case "sqlite":
      const db = new Database(config.filePath, { readonly: true });
      const tableNames = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .pluck()
        .all() as string[];
      const sqliteTables: TableInfo[] = [];
      for (const tableName of tableNames) {
        const row: any = db
          .prepare(
            `SELECT MIN(${config.mapping.epochColumn}) AS min_ts, MAX(${config.mapping.epochColumn}) AS max_ts FROM "${tableName}"`
          )
          .get();
        const minTs = row["min_ts"] as number;
        const maxTs = row["max_ts"] as number;
        if (minTs !== null && maxTs !== null) {
          sqliteTables.push({
            name: tableName,
            from: toDate(minTs, config.mapping),
            to: toDate(maxTs, config.mapping),
          });
        }
      }
      return sqliteTables;
    default:
      return [];
  }
}

export async function listTables(
  config: DataSourceConfig,
  pool?: any
): Promise<string[]> {
  switch (config.type) {
    case "mysql":
      const [rows] = await (pool as mysql.Pool).query<mysql.RowDataPacket[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
        [config.database]
      );
      return rows.map((row) => row["table_name"] as string);
    case "postgres":
      const result = await (pool as pg.Pool).query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
        [config.schema]
      );
      return result.rows.map((row) => row.tablename);
    case "sqlite":
      const db = new Database(config.filePath, { readonly: true });
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .pluck()
        .all() as string[];
      return tables;
    default:
      return [];
  }
}
