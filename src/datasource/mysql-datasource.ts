import mysql from "mysql2/promise";
import type { DataRow } from "./data-source.js";
import { DataSource, DataIterator } from "./data-source.js";
import { toDate, toEpoch } from "../shared/utils.js";
import type { TableInfo } from "../shared/types.js";
import type {
  MySQLConfig,
  ColumnMapping,
  TableConfig,
} from "../schema/data-source.schema.js";
import type { TimeRep } from "../schema/data-source.schema.js";

function quoteIdent(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

export class MySQLDataSource extends DataSource {
  private pool: mysql.Pool;
  private config: MySQLConfig;

  constructor(config: MySQLConfig, pool: mysql.Pool) {
    super();
    this.config = config;
    this.pool = pool;
  }

  async getTableInfo(): Promise<TableInfo[]> {
    const result: TableInfo[] = [];

    for (const table of this.config.tables) {
      const timeRep: TimeRep = {
        epochUnit: table.epochUnit,
        timezone: table.timezone,
      };

      const tableName = quoteIdent(table.name);
      const epochCol = quoteIdent(table.mapping.epoch);

      const query = `SELECT MIN(${epochCol}) as min, MAX(${epochCol}) as max FROM ${tableName}`;

      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(query);
      const row = rows[0];

      if (!row || row["min"] == null || row["max"] == null) continue;

      const startTime = toDate(row["min"], timeRep);
      const endTime = toDate(row["max"], timeRep);

      result.push({
        name: table.name,
        type: table.type,
        startTime,
        endTime,
      });
    }

    return result;
  }

  async loadTable(
    table: string,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ): Promise<DataIterator> {
    const tableConfig = this.config.tables.find((t) => t.name === table);
    if (!tableConfig) {
      throw new Error(`No config found for table ${table}`);
    }

    return new MySQLIterator(
      this.pool,
      tableConfig,
      symbols,
      startTime,
      endTime
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class MySQLIterator extends DataIterator {
  private pool: mysql.Pool;
  private tableConfig: TableConfig;
  private mapping: ColumnMapping;
  private symbols: string[];
  private timeRep: TimeRep;
  private startEpoch: number;
  private endEpoch: number | null;
  private epochIndex: number[] = [];
  private curEpochIdx = 0;
  private loaded = false;
  private batchQueryText: string = "";

  constructor(
    pool: mysql.Pool,
    tableConfig: TableConfig,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ) {
    super();
    this.pool = pool;
    this.tableConfig = tableConfig;
    this.mapping = tableConfig.mapping;
    this.symbols = symbols;
    this.timeRep = {
      epochUnit: tableConfig.epochUnit,
      timezone: tableConfig.timezone,
    };

    this.startEpoch = toEpoch(startTime, this.timeRep);
    this.endEpoch = endTime ? toEpoch(endTime, this.timeRep) : null;

    const tableName = quoteIdent(this.tableConfig.name);
    const epochCol = quoteIdent(this.mapping.epoch);
    const symbolCol = quoteIdent(this.mapping.symbol);

    const selectAll = this.symbols.includes("*");
    this.batchQueryText = `SELECT * FROM ${tableName} WHERE ${epochCol} = ?`;
    if (!selectAll && this.symbols.length > 0) {
      const placeholders = this.symbols.map(() => "?").join(", ");
      this.batchQueryText += ` AND ${symbolCol} IN (${placeholders})`;
    }
  }

  private async loadEpochIndex(): Promise<void> {
    const tableName = quoteIdent(this.tableConfig.name);
    const epochCol = quoteIdent(this.mapping.epoch);

    let query = `SELECT DISTINCT ${epochCol} FROM ${tableName} WHERE ${epochCol} >= ?`;
    const params: number[] = [this.startEpoch];

    if (this.endEpoch !== null) {
      query += ` AND ${epochCol} <= ?`;
      params.push(this.endEpoch);
    }

    query += ` ORDER BY ${epochCol}`;

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      query,
      params
    );
    this.epochIndex = rows.map((row) => row[this.mapping.epoch] as number);
    this.loaded = true;
  }

  async nextBatch(): Promise<DataRow[]> {
    if (!this.loaded) {
      await this.loadEpochIndex();
    }

    if (this.curEpochIdx >= this.epochIndex.length) {
      return [];
    }

    const epoch = this.epochIndex[this.curEpochIdx++]!;
    const timestamp = toDate(epoch, this.timeRep);

    const selectAll = this.symbols.includes("*");
    const params: (number | string)[] = [epoch];
    if (!selectAll && this.symbols.length > 0) {
      params.push(...this.symbols);
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      this.batchQueryText,
      params
    );

    const result: DataRow[] = [];
    for (const row of rows) {
      result.push({
        ...row,
        symbol: row[this.mapping.symbol] as string,
        timestamp,
      });
    }

    return result;
  }
}
