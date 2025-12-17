import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SQLiteDataSource } from "../src/datasource/sqlite-datasource.js";
import type { SQLiteConfig } from "../src/schema/data-source.schema.js";

describe("SQLiteDataSource", () => {
  let dataSource: SQLiteDataSource;

  const config: SQLiteConfig = {
    type: "sqlite",
    filePaths: ["fixtures/db-0.db", "fixtures/db-1.db", "fixtures/db-2.db"],
    tables: [
      {
        name: "table0",
        type: "quote",
        epochUnit: "s",
        timezone: "UTC",
        mapping: {
          symbol: "symbol",
          epoch: "timestamp",
        },
      },
      {
        name: "table1",
        type: "trade",
        epochUnit: "s",
        timezone: "UTC",
        mapping: {
          symbol: "symbol",
          epoch: "timestamp",
        },
      },
    ],
  };

  beforeAll(() => {
    dataSource = new SQLiteDataSource(config);
  });

  afterAll(async () => {
    await dataSource.close();
  });

  it("should get table info correctly", async () => {
    const tableInfo = await dataSource.getTableInfo();

    expect(tableInfo).toHaveLength(2);

    const table0Info = tableInfo.find((t) => t.name === "table0");
    expect(table0Info).toBeDefined();
    expect(table0Info!.startTime).toEqual(new Date(1000 * 1000));
    expect(table0Info!.endTime).toEqual(new Date(1005 * 1000));

    const table1Info = tableInfo.find((t) => t.name === "table1");
    expect(table1Info).toBeDefined();
    expect(table1Info!.startTime).toEqual(new Date(1000 * 1000));
    expect(table1Info!.endTime).toEqual(new Date(1008 * 1000));
  });

  it("should iterate table0 with all symbols", async () => {
    const iterator = await dataSource.loadTable(
      "table0",
      ["*"],
      new Date(1000 * 1000),
      new Date(1005 * 1000)
    );

    const batches: number[] = [];
    for await (const batch of iterator) {
      batches.push(batch.length);
    }

    // 6 epochs (1000-1005), 2 symbols each = 2 rows per batch
    expect(batches).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("should iterate table0 with specific symbol", async () => {
    const iterator = await dataSource.loadTable(
      "table0",
      ["A"],
      new Date(1000 * 1000),
      new Date(1005 * 1000)
    );

    const batches: number[] = [];
    for await (const batch of iterator) {
      batches.push(batch.length);
      expect(batch.every((row) => row.symbol === "A")).toBe(true);
    }

    expect(batches).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("should iterate table1 across all 3 databases", async () => {
    const iterator = await dataSource.loadTable(
      "table1",
      ["*"],
      new Date(1000 * 1000),
      new Date(1008 * 1000)
    );

    const epochs: number[] = [];
    for await (const batch of iterator) {
      expect(batch.length).toBe(2);
      epochs.push(batch[0]!.timestamp.getTime() / 1000);
    }

    expect(epochs).toEqual([
      1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008,
    ]);
  });

  it("should iterate with time range filter", async () => {
    const iterator = await dataSource.loadTable(
      "table1",
      ["X"],
      new Date(1003 * 1000),
      new Date(1006 * 1000)
    );

    const rows: number[] = [];
    for await (const batch of iterator) {
      expect(batch.every((row) => row.symbol === "X")).toBe(true);
      rows.push(...batch.map((r) => r.timestamp.getTime() / 1000));
    }

    expect(rows).toEqual([1003, 1004, 1005, 1006]);
  });

  it("should handle multiple symbols", async () => {
    const iterator = await dataSource.loadTable(
      "table1",
      ["X", "Y"],
      new Date(1000 * 1000),
      new Date(1002 * 1000)
    );

    let totalRows = 0;
    for await (const batch of iterator) {
      totalRows += batch.length;
      expect(batch.every((row) => ["X", "Y"].includes(row.symbol))).toBe(true);
    }

    expect(totalRows).toBe(6); // 3 epochs * 2 symbols
  });

  it("should return empty when no data in range", async () => {
    const iterator = await dataSource.loadTable(
      "table0",
      ["*"],
      new Date(2000 * 1000),
      new Date(3000 * 1000)
    );

    const batches = [];
    for await (const batch of iterator) {
      batches.push(batch);
    }

    expect(batches).toEqual([]);
  });

  it("should preserve all row fields", async () => {
    const iterator = await dataSource.loadTable(
      "table0",
      ["A"],
      new Date(1000 * 1000),
      new Date(1000 * 1000)
    );

    for await (const batch of iterator) {
      const row = batch[0]!;
      expect(row).toHaveProperty("symbol", "A");
      expect(row).toHaveProperty("timestamp");
      expect(row).toHaveProperty("price", 100.0);
      expect(row).toHaveProperty("volume", 1000);
    }
  });
});
