import { z } from "zod";

export const ColumnMappingSchema = z
  .object({
    // hardcoded required field symbol
    symbol: z.string().default("symbol"),
    // hardcoded required field epoch, number -> Date conversion applied upon data retrieval
    epoch: z.string().default("timestamp"),
  })
  // mapping of column: required field -> source column name
  .and(z.record(z.string(), z.string()));

export const TableConfigSchema = z.object({
  // table name
  name: z.string(),
  // table data type, client defined
  type: z.string(),
  // epoch time representation
  epochUnit: z.enum(["s", "ms", "us", "days"]).default("s"),
  // timezone of the epoch time
  timezone: z.string().default("UTC"),
  // column mapping
  mapping: ColumnMappingSchema,
});

export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export type TableConfig = z.infer<typeof TableConfigSchema>;

export type TimeRep = {
  epochUnit: "s" | "ms" | "us" | "days";
  timezone: string;
};

// SQLite

export const SQLiteConfigSchema = z.object({
  type: z.literal("sqlite"),
  // database files partitioned by time, ordered ascending
  filePaths: z.array(z.string().min(1, "File path cannot be empty")).min(1),
  tables: z.array(TableConfigSchema).min(1),
});

export type SQLiteConfig = z.infer<typeof SQLiteConfigSchema>;

// PG & MySQL

const TCPConnectionSchema = z.object({
  conn: z.literal("tcp"),
  host: z.string().min(1, "Hostname cannot be empty"),
  port: z.number().min(1).max(65535),
  ssl: z.boolean().default(false),
});

const SocketConnectionSchema = z.object({
  conn: z.literal("sock"),
  socketPath: z.string().min(1, "Socket path cannot be empty"),
});

const LoginSchema = z.object({
  username: z.string().min(1, "Username cannot be empty"),
  password: z.string().optional(),
});

export const PostgresSchema = z
  .discriminatedUnion("conn", [TCPConnectionSchema, SocketConnectionSchema])
  .and(LoginSchema)
  .and(
    z.object({
      type: z.literal("postgres"),
      database: z.string().min(1, "Database name cannot be empty"),
      schema: z.string().default("public"),
      tables: z.array(TableConfigSchema).min(1),
    })
  );

export const MySQLSchema = z
  .discriminatedUnion("conn", [TCPConnectionSchema, SocketConnectionSchema])
  .and(LoginSchema)
  .and(
    z.object({
      type: z.literal("mysql"),
      database: z.string().min(1, "Database name cannot be empty"),
      tables: z.array(TableConfigSchema).min(1),
    })
  );

export type PostgresConfig = z.infer<typeof PostgresSchema>;

export type MySQLConfig = z.infer<typeof MySQLSchema>;

// File-based datasource

export const FileTableConfigSchema = TableConfigSchema.and(
  z.object({
    // data files partitioned by time, ordered ascending
    filePaths: z.array(z.string().min(1, "File path cannot be empty")).min(1),
  })
);

export type FileTableConfig = z.infer<typeof FileTableConfigSchema>;

export const JSONSchema = z.object({
  type: z.literal("json"),
  tables: z.array(FileTableConfigSchema).min(1),
});

export type JSONConfig = z.infer<typeof JSONSchema>;

export const CSVSchema = z.object({
  type: z.literal("csv"),
  delimiter: z.string().min(1).max(1).default(","),
  hasHeader: z.boolean().default(true),
  quoteChar: z.string().length(1).default('"'),
  tables: z.array(FileTableConfigSchema).min(1),
});

export type CSVConfig = z.infer<typeof CSVSchema>;
