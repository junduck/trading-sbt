/**
 * Client-side schema exports
 *
 * This module provides clean deep imports for client applications.
 * - Request/Response types for all operations
 * - Event types for all event kinds
 * - Encode/decode/validate helpers for serialization
 * - Trading-core type re-exports for convenience
 *
 * Wire formats are intentionally not exposed.
 */

// Request/Response types
export type {
  amendOrdersRequest,
  CancelOrdersRequest,
  InitReponse,
  LoginRequest,
  LoginResponse,
  ReplayRequest,
  ReplayResponse,
  SubmitOrderRequest,
} from "./schema/index.js";

// Event types
export type {
  MarketEvent,
  OrderEvent,
  MetricsEvent,
  ExternalEvent,
  SbtEvent,
} from "./schema/event.schema.js";

// Metrics types
export type {
  MetricsReport,
  ReportType,
} from "./schema/metrics-report.schema.js";

// Re-export trading-core types for convenience
export type {
  Order,
  OrderState,
  Position,
  Fill,
  MarketQuote,
  PartialOrder,
} from "@junduck/trading-core";

// Schema helpers with encode/decode/validate
export { amendOrders } from "./schema/amendOrders.schema.js";
export { cancelOrders, cancelAllOrders } from "./schema/cancelOrders.schema.js";
export { getOpenOrders } from "./schema/getOpenOrders.schema.js";
export { getPosition } from "./schema/getPosition.schema.js";
export { init } from "./schema/init.schema.js";
export { login } from "./schema/login.schema.js";
export { replay } from "./schema/replay.schema.js";
export { submitOrders } from "./schema/submitOrders.schema.js";
export { subscribe, unsubscribe } from "./schema/subscribe.schema.js";

// Event helpers
export {
  sbtEvent,
  marketEvent,
  orderEvent,
  metricsEvent,
  externalEvent,
} from "./schema/event.schema.js";
