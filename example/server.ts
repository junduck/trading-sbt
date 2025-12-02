import { createServer } from "../src/server.js";
import type { DataSourceConfig } from "../src/schema/data-source.schema.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load data source config from example/config.json
const configPath = join(__dirname, "config.json");

if (!existsSync(configPath)) {
  console.error(`Config file not found at ${configPath}`);
  console.error("Please create a config.json file with DataSourceConfig");
  process.exit(1);
}

const configData = readFileSync(configPath, "utf-8");
const config = JSON.parse(configData) as DataSourceConfig;

// Resolve relative paths from config file location
if (config.type === "sqlite" && config.filePath) {
  config.filePath = join(__dirname, config.filePath);
}

const server = createServer(8080, config);

console.log("Server is running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  console.log("\nShutting down server...");
  await server.close();
  process.exit(0);
});
