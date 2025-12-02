import { createServer } from "./server.js";
import type { DataSourceConfig } from "./schema/data-source.schema.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"]) : 8080;
const CONFIG_PATH = process.env["SBT_CONFIG"] || join(process.cwd(), "config.json");

if (!existsSync(CONFIG_PATH)) {
  console.error(`Config file not found at ${CONFIG_PATH}`);
  console.error("Please create a config.json file with DataSourceConfig or set SBT_CONFIG env var");
  process.exit(1);
}

const configData = readFileSync(CONFIG_PATH, "utf-8");
const config = JSON.parse(configData) as DataSourceConfig;

createServer(PORT, config);
