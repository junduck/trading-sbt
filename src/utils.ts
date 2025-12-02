import type { MarketEvent, ExternalEvent } from "./protocol.js";
import type { DataRep, DataSourceConfig } from "./schema/data-source.schema.js";
import mysql from "mysql2/promise";
import pg from "pg";
import Database from "better-sqlite3";

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
 * Convert a standardized row to a MarketEvent.
 */
export function toMarketEvent(
  rows: Array<Record<string, any>>,
  rep: DataRep
): MarketEvent {
  const data = rows.map((row) => ({
    ...row,
    symbol: row[rep.symbolColumn],
    price: row[rep.priceColumn],
    timestamp: toDate(row[rep.epochColumn], rep),
  }));

  return {
    timestamp: new Date(), // event timestamp we use server time
    type: "market",
    marketData: data,
  };
}

/**
 * Convert a standardized row to an ExternalEvent.
 */
export function toExternalEvent(
  rows: Array<Record<string, any>>,
  table: string, // just map table to source
  rep: DataRep
): ExternalEvent {
  const data = rows.map((row) => ({
    ...row,
    timestamp: toDate(row[rep.epochColumn], rep),
  }));

  return {
    type: "external",
    timestamp: new Date(), // event timestamp we use server time
    source: table,
    data,
  };
}

export async function getAvailTables(
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
