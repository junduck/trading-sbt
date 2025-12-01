import { createServer } from "../src/server.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set config path to example/config.json
process.env["SBT_CONFIG"] = join(__dirname, "config.json");

const server = createServer(8080);

console.log("Server is running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  console.log("\nShutting down server...");
  await server.close();
  process.exit(0);
});
