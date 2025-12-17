import { readFile } from "node:fs/promises";
import type { DataRow } from "./data-source.js";
import { DataSource, DataIterator } from "./data-source.js";
import type {
  JSONConfig,
  ColumnMapping,
  FileTableConfig,
  TimeRep,
} from "../schema/data-source.schema.js";
import { toDate, toEpoch } from "../shared/utils.js";
import type { TableInfo } from "../shared/types.js";

type Row = Record<string, unknown>;

export class JSONDataSource extends DataSource {
  private config: JSONConfig;

  constructor(config: JSONConfig) {
    super();
    this.config = config;
  }

  async getTableInfo(): Promise<TableInfo[]> {
    const result: TableInfo[] = [];

    for (const table of this.config.tables) {
      if (table.filePaths.length === 0) continue;

      const firstFile = table.filePaths[0]!;
      const timeRep: TimeRep = {
        epochUnit: table.epochUnit,
        timezone: table.timezone,
      };

      const content = await readFile(firstFile, "utf8");
      if (!content.trim()) continue;

      const rows = JSON.parse(content) as Row[];
      if (rows.length === 0) continue;

      const firstRow = rows[0]!;
      const epoch = firstRow[table.mapping.epoch] as number;
      const startTime = toDate(epoch, timeRep);

      result.push({
        name: table.name,
        type: table.type,
        startTime,
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

    return new JSONIterator(tableConfig, symbols, startTime, endTime);
  }

  async close(): Promise<void> {}
}

class JSONIterator extends DataIterator {
  private filePaths: string[];
  private mapping: ColumnMapping;
  private symbols: string[];
  private timeRep: TimeRep;
  private startEpoch: number;
  private endEpoch: number | null;
  private epochIndex: number[][] = [];
  private dataCache: Map<number, DataRow[]>[] = [];
  private curFile = 0;
  private curEpochIdx = 0;
  private loaded = false;

  constructor(
    tableConfig: FileTableConfig,
    symbols: string[],
    startTime: Date,
    endTime?: Date
  ) {
    super();
    this.filePaths = tableConfig.filePaths;
    this.mapping = tableConfig.mapping;
    this.symbols = symbols;
    this.timeRep = {
      epochUnit: tableConfig.epochUnit,
      timezone: tableConfig.timezone,
    };

    this.startEpoch = toEpoch(startTime, this.timeRep);
    this.endEpoch = endTime ? toEpoch(endTime, this.timeRep) : null;
  }

  private async loadFileIndex(): Promise<void> {
    for (let i = 0; i < this.filePaths.length; i++) {
      this.epochIndex.push([]);
      this.dataCache.push(new Map());

      const filePath = this.filePaths[i]!;
      const content = await readFile(filePath, "utf8");
      if (!content.trim()) continue;

      const rows = JSON.parse(content) as Row[];
      const epochMap = new Map<number, DataRow[]>();
      const epochSet = new Set<number>();

      for (const row of rows) {
        const epoch = row[this.mapping.epoch] as number;

        if (epoch < this.startEpoch) continue;
        if (this.endEpoch !== null && epoch > this.endEpoch) break;

        const symbol = row[this.mapping.symbol] as string;
        const selectAll = this.symbols.includes("*");
        if (
          !selectAll &&
          this.symbols.length > 0 &&
          !this.symbols.includes(symbol)
        ) {
          continue;
        }

        const timestamp = toDate(epoch, this.timeRep);
        const dataRow: DataRow = {
          ...row,
          symbol,
          timestamp,
        };

        const existing = epochMap.get(epoch);
        if (existing) {
          existing.push(dataRow);
        } else {
          epochMap.set(epoch, [dataRow]);
          epochSet.add(epoch);
        }
      }

      this.epochIndex[i] = Array.from(epochSet).sort((a, b) => a - b);
      this.dataCache[i] = epochMap;
    }

    this.loaded = true;
  }

  async nextBatch(): Promise<DataRow[]> {
    if (!this.loaded) {
      await this.loadFileIndex();
    }

    while (this.curFile < this.filePaths.length) {
      if (this.curEpochIdx >= this.epochIndex[this.curFile]!.length) {
        this.curFile++;
        this.curEpochIdx = 0;
        continue;
      }

      const epoch = this.epochIndex[this.curFile]![this.curEpochIdx++]!;
      const rows = this.dataCache[this.curFile]!.get(epoch) ?? [];
      return rows;
    }

    return [];
  }
}
