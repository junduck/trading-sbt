import type {
  DataSourceConfig,
  TimeRep,
} from "../schema/data-source.schema.js";
import mysql from "mysql2/promise";
import pg from "pg";
import Database from "better-sqlite3";
import type { TableInfo } from "./types.js";
import { getTimezoneOffset } from "date-fns-tz";

export function serverTime(): Date {
  return new Date();
}

/**
 * Convert epoch time to Date based on TimeRep configuration.
 * @param time Epoch time
 * @param rep Time representation config with epochUnit and timezone
 * @returns Date object
 *
 * @notes if epochUnit is "days", returns Date at midnight in specified timezone
 */
export function toDate(time: number, rep: TimeRep): Date {
  switch (rep.epochUnit) {
    case "s":
      return new Date(time * 1000);
    case "ms":
      return new Date(time);
    case "us":
      return new Date(time / 1000);
    case "days":
      const ms = time * 86400 * 1000;
      // if days, time is now days since epoch in specified timezone, get offset from Date(ms) to handle potential DST
      const offsetMs = getTimezoneOffset(rep.timezone, new Date(ms));
      return new Date(ms - offsetMs);
  }
}

/**
 * Convert Date to epoch time based on TimeRep configuration.
 * @param date Date object
 * @param rep Time representation config with epochUnit and timezone
 * @returns Epoch time
 *
 * @notes if epochUnit is "days", returns days since "local epoch" (1970-01-01 local midnight) in specified timezone
 */
export function toEpoch(date: Date, rep: TimeRep): number {
  switch (rep.epochUnit) {
    case "s":
      return Math.floor(date.getTime() / 1000);
    case "ms":
      return date.getTime();
    case "us":
      return date.getTime() * 1000;
    case "days":
      // if days, return days since epoch in specified timezone
      const offsetMs = getTimezoneOffset(rep.timezone, date);
      return Math.floor((date.getTime() + offsetMs) / (86400 * 1000));
  }
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
            startTime: toDate(minTs, config.mapping),
            endTime: toDate(maxTs, config.mapping),
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
            startTime: toDate(minTs, config.mapping),
            endTime: toDate(maxTs, config.mapping),
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
            startTime: toDate(minTs, config.mapping),
            endTime: toDate(maxTs, config.mapping),
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

/**
 * Recursively strip null values from an object.
 * Converts null and undefined to undefined so zod can handle it properly.
 */
export function stripNulls(obj: unknown): unknown {
  if (obj === null) {
    return undefined;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => stripNulls(item));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = stripNulls(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }
  return obj;
}
