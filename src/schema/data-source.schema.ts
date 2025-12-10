import { z } from "zod";

// Data representation mapping
const DataRepSchema = z.object({
  symbolColumn: z.string().default("symbol"),
  epochColumn: z.string().default("timestamp"),
  priceColumn: z.string().default("close"),
  epochUnit: z.enum(["s", "ms", "us", "days"]).default("s"),
  timezone: z.string().default("UTC"),
});

// Connection Types
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

// Postgres
const PostgresSchema = z.intersection(
  z.discriminatedUnion("conn", [TCPConnectionSchema, SocketConnectionSchema]),
  z.object({
    type: z.literal("postgres"),
    database: z.string().min(1, "Database name cannot be empty"),
    schema: z.string().default("public"),
    username: z.string().min(1, "Username cannot be empty"),
    password: z.string().optional(),
    mapping: DataRepSchema,
    replay: z.array(z.string()).optional(),
  })
);

// MySQL
const MySQLSchema = z.intersection(
  z.discriminatedUnion("conn", [TCPConnectionSchema, SocketConnectionSchema]),
  z.object({
    type: z.literal("mysql"),
    database: z.string().min(1, "Database name cannot be empty"),
    username: z.string().min(1, "Username cannot be empty"),
    password: z.string().optional(),
    mapping: DataRepSchema,
    replay: z.array(z.string()).optional(),
  })
);

// SQLite
const SQLiteSchema = z.object({
  type: z.literal("sqlite"),
  filePath: z.string().min(1, "File path cannot be empty"),
  mapping: DataRepSchema,
  replay: z.array(z.string()).optional(),
});

// CSV
const CSVSchema = z.object({
  type: z.literal("csv"),
  filePath: z.string().min(1, "File path cannot be empty"),
  delimiter: z.string().length(1).default(","),
  hasHeader: z.boolean().default(true),
  quoteChar: z.string().length(1).default('"'),
  mapping: DataRepSchema,
});

// JSON
const JSONSchema = z.object({
  type: z.literal("json"),
  filePath: z.string().min(1, "File path cannot be empty"),
  mapping: DataRepSchema,
});

export const DataSourceSchema = z.union([
  PostgresSchema,
  MySQLSchema,
  SQLiteSchema,
  CSVSchema,
  JSONSchema,
]);

export type DataSourceConfig = z.infer<typeof DataSourceSchema>;
export type DataRep = z.infer<typeof DataRepSchema>;
