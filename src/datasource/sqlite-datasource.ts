import Database from "better-sqlite3";
import type { DataRow } from "./data-source.js";
import { DataSource, DataIterator } from "./data-source.js";
import { toDate, toEpoch } from "../shared/utils.js";
import type { TableInfo } from "../shared/types.js";
import type {
  SQLiteConfig,
  ColumnMapping,
} from "../schema/data-source.schema.js";
import type { TableConfig } from "../schema/data-source.schema.js";
import type { TimeRep } from "../schema/data-source.schema.js";

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(tableName);
  return row !== undefined;
}

export class SQLiteDataSource extends DataSource {
  private conns: Database.Database[] = [];
  private config: SQLiteConfig;

  constructor(config: SQLiteConfig) {
    super();
    this.config = config;

    for (const filePath of config.filePaths) {
      const db = new Database(filePath, { readonly: true });
      this.conns.push(db);
    }

    for (const table of config.tables) {
      const found = this.conns.some((db) => tableExists(db, table.name));
      if (!found) {
        throw new Error(`Table ${table.name} not found in any database file`);
      }
    }
  }

  async getTableInfo(): Promise<TableInfo[]> {
    const tableInfoMap = new Map<string, TableInfo>();

    for (const table of this.config.tables) {
      const timeRep: TimeRep = {
        epochUnit: table.epochUnit,
        timezone: table.timezone,
      };

      for (const db of this.conns) {
        if (!tableExists(db, table.name)) continue;

        const epochCol = quoteIdent(table.mapping.epoch);
        const query = `SELECT MIN(${epochCol}) as min, MAX(${epochCol}) as max FROM ${quoteIdent(
          table.name
        )}`;
        const row = db.prepare(query).get() as
          | { min: number; max: number }
          | undefined;

        if (!row || row.min == null || row.max == null) continue;

        const startTime = toDate(row.min, timeRep);
        const endTime = toDate(row.max, timeRep);

        const existing = tableInfoMap.get(table.name);
        if (!existing) {
          tableInfoMap.set(table.name, {
            name: table.name,
            type: table.type,
            startTime,
            endTime,
          });
        } else {
          if (startTime < existing.startTime) {
            existing.startTime = startTime;
          }
          if (endTime > (existing.endTime ?? startTime)) {
            existing.endTime = endTime;
          }
        }
      }
    }

    return Array.from(tableInfoMap.values());
  }

  async loadTable(
    table: string,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ): Promise<DataIterator> {
    const tableEntry = this.config.tables.find((t) => t.name === table);
    if (!tableEntry) {
      throw new Error(`No config found for table ${table}`);
    }

    return new SQLiteIterator(
      this.conns,
      tableEntry,
      symbols,
      startTime,
      endTime
    );
  }

  async close(): Promise<void> {
    for (const db of this.conns) {
      db.close();
    }
    this.conns = [];
  }
}

class SQLiteIterator extends DataIterator {
  private conns: Database.Database[];
  private stmts: Database.Statement[] = [];
  private mapping: ColumnMapping;
  private symbols: string[];
  private timeRep: TimeRep;
  private epochIndex: number[][] = [];
  private curDb = 0;
  private curEpochIdx = 0;

  constructor(
    conns: Database.Database[],
    tableConfig: TableConfig,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ) {
    super();
    this.conns = conns;
    this.mapping = tableConfig.mapping;
    this.symbols = symbols;
    this.timeRep = {
      epochUnit: tableConfig.epochUnit,
      timezone: tableConfig.timezone,
    };

    const startEpoch = toEpoch(startTime, this.timeRep);
    const endEpoch = endTime ? toEpoch(endTime, this.timeRep) : null;

    const epochCol = quoteIdent(this.mapping.epoch);
    const symbolCol = quoteIdent(this.mapping.symbol);
    const tableName = quoteIdent(tableConfig.name);
    const selectAll = symbols.includes("*");

    for (const db of conns) {
      if (!tableExists(db, tableConfig.name)) {
        this.epochIndex.push([]);
        this.stmts.push(null!);
        continue;
      }

      let indexQuery = `SELECT DISTINCT ${epochCol} FROM ${tableName} WHERE ${epochCol} >= ?`;
      const params: number[] = [startEpoch];

      if (endEpoch !== null) {
        indexQuery += ` AND ${epochCol} <= ?`;
        params.push(endEpoch);
      }

      indexQuery += ` ORDER BY ${epochCol}`;

      const rows = db.prepare(indexQuery).all(...params) as Array<{
        [key: string]: number;
      }>;

      this.epochIndex.push(rows.map((row) => row[this.mapping.epoch]!));

      let selectQuery = `SELECT * FROM ${tableName} WHERE ${epochCol} = ?`;
      if (!selectAll && symbols.length > 0) {
        const placeholders = symbols.map(() => "?").join(", ");
        selectQuery += ` AND ${symbolCol} IN (${placeholders})`;
      }

      this.stmts.push(db.prepare(selectQuery));
    }
  }

  async nextBatch(): Promise<DataRow[]> {
    while (this.curDb < this.conns.length) {
      if (this.curEpochIdx >= this.epochIndex[this.curDb]!.length) {
        this.curDb++;
        this.curEpochIdx = 0;
        continue;
      }

      const epoch = this.epochIndex[this.curDb]![this.curEpochIdx++]!;
      const timestamp = toDate(epoch, this.timeRep);
      const stmt = this.stmts[this.curDb]!;

      const selectAll = this.symbols.includes("*");
      const params: (number | string)[] = [epoch];
      if (!selectAll && this.symbols.length > 0) {
        params.push(...this.symbols);
      }

      const dbRows = stmt.all(...params) as Array<{
        [key: string]: unknown;
      }>;

      const rows: DataRow[] = [];
      for (const row of dbRows) {
        rows.push({
          ...row,
          symbol: row[this.mapping.symbol] as string,
          timestamp,
        });
      }

      return rows;
    }

    return [];
  }
}
