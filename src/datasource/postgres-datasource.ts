import pg from "pg";
import type { DataRow } from "./data-source.js";
import { DataSource, DataIterator } from "./data-source.js";
import { toDate, toEpoch } from "../shared/utils.js";
import type { TableInfo } from "../shared/types.js";
import type {
  PostgresConfig,
  ColumnMapping,
  TableConfig,
} from "../schema/data-source.schema.js";
import type { TimeRep } from "../schema/data-source.schema.js";

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export class PostgresDataSource extends DataSource {
  private pool: pg.Pool;
  private config: PostgresConfig;

  constructor(config: PostgresConfig, pool: pg.Pool) {
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

      const schema = quoteIdent(this.config.schema);
      const tableName = quoteIdent(table.name);
      const epochCol = quoteIdent(table.mapping.epoch);

      const query = `SELECT MIN(${epochCol}) as min, MAX(${epochCol}) as max FROM ${schema}.${tableName}`;

      const res = await this.pool.query(query);
      const row = res.rows[0];

      if (!row || row.min == null || row.max == null) continue;

      const startTime = toDate(row.min, timeRep);
      const endTime = toDate(row.max, timeRep);

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

    return new PostgresIterator(
      this.pool,
      this.config.schema,
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

class PostgresIterator extends DataIterator {
  private pool: pg.Pool;
  private schema: string;
  private tableConfig: TableConfig;
  private mapping: ColumnMapping;
  private symbols: string[];
  private timeRep: TimeRep;
  private startEpoch: number;
  private endEpoch: number | null;
  private epochIndex: number[] = [];
  private curEpochIdx = 0;
  private loaded = false;
  private batchQueryName: string = "";
  private batchQueryText: string = "";

  constructor(
    pool: pg.Pool,
    schema: string,
    tableConfig: TableConfig,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ) {
    super();
    this.pool = pool;
    this.schema = schema;
    this.tableConfig = tableConfig;
    this.mapping = tableConfig.mapping;
    this.symbols = symbols;
    this.timeRep = {
      epochUnit: tableConfig.epochUnit,
      timezone: tableConfig.timezone,
    };

    this.startEpoch = toEpoch(startTime, this.timeRep);
    this.endEpoch = endTime ? toEpoch(endTime, this.timeRep) : null;

    const schemaName = quoteIdent(this.schema);
    const tableName = quoteIdent(this.tableConfig.name);
    const epochCol = quoteIdent(this.mapping.epoch);
    const symbolCol = quoteIdent(this.mapping.symbol);

    const selectAll = this.symbols.includes("*");
    this.batchQueryText = `SELECT * FROM ${schemaName}.${tableName} WHERE ${epochCol} = $1`;
    if (!selectAll && this.symbols.length > 0) {
      this.batchQueryText += ` AND ${symbolCol} = ANY($2)`;
      this.batchQueryName = `batch_${schema}_${tableConfig.name}_filtered`;
    } else {
      this.batchQueryName = `batch_${schema}_${tableConfig.name}_all`;
    }
  }

  private async loadEpochIndex(): Promise<void> {
    const schemaName = quoteIdent(this.schema);
    const tableName = quoteIdent(this.tableConfig.name);
    const epochCol = quoteIdent(this.mapping.epoch);

    let query = `SELECT DISTINCT ${epochCol} FROM ${schemaName}.${tableName} WHERE ${epochCol} >= $1`;
    const params: number[] = [this.startEpoch];

    if (this.endEpoch !== null) {
      query += ` AND ${epochCol} <= $2`;
      params.push(this.endEpoch);
    }

    query += ` ORDER BY ${epochCol}`;

    const result = await this.pool.query(query, params);
    this.epochIndex = result.rows.map(
      (row) => row[this.mapping.epoch] as number
    );
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
    const params: (number | string[])[] = [epoch];
    if (!selectAll && this.symbols.length > 0) {
      params.push(this.symbols);
    }

    const result = await this.pool.query({
      name: this.batchQueryName,
      text: this.batchQueryText,
      values: params,
    });

    const rows: DataRow[] = [];
    for (const row of result.rows) {
      rows.push({
        ...row,
        symbol: row[this.mapping.symbol] as string,
        timestamp,
      });
    }

    return rows;
  }
}
