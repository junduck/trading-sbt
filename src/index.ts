// Server-side exports
export { Server, createServer } from "./server/server.js";
export { Session } from "./server/session.js";
export { BacktestBroker } from "./backtest/backtest-broker.js";
export { BacktestMetrics } from "./backtest/backtest-metrics.js";

// Client-side orchestrator
export { Orchestrator } from "./client/orchestrator.js";
export type { ClientContext } from "./client/orchestrator.js";

// Schema and types (for server-side and internal use)
export * from "./schema/index.js";
export type { TableInfo } from "./shared/types.js";

// Client schema namespace (for client-side deep import)
export * as clientSchema from "./client-schema.js";
