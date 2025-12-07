import { createServer } from "../src/server/server.js";
import type { DataSourceConfig } from "../src/schema/data-source.schema.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load data source config from environment or default to config.json
const configFile = process.env.CONFIG_FILE || "config.json";
const configPath = join(__dirname, configFile);

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

let server;
try {
  server = await createServer(8080, config);
} catch (error) {
  console.error("Failed to start server:");
  if (error instanceof Error) {
    console.error(`  ${error.message}`);
  } else {
    console.error(`  ${error}`);
  }
  console.error("\nPlease check your configuration and database connection.");
  process.exit(1);
}

console.log("Server is running. Press Ctrl+C to stop.");

// Handle graceful shutdown
let shutdownInProgress = false;
process.on("SIGINT", async () => {
  if (shutdownInProgress) {
    console.log("\nForce shutting down...");
    process.exit(1);
  }

  shutdownInProgress = true;
  console.log("\nShutting down server...");

  try {
    await server.close();
    console.log("Server closed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
});
