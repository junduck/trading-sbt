import type {
  Position,
  OrderState,
  MarketQuote,
  Fill,
} from "@junduck/trading-core/trading";
import type { MetricsReport } from "./backtest-metrics.js";

export interface Request {
  action: string;
  action_id: number;
  params: unknown;
}

export interface Response {
  type: "response";
  action_id: number;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface BaseEvent {
  type: "market" | "external" | "order" | "metrics";
  timestamp: Date;
}

export interface MarketEvent extends BaseEvent {
  type: "market";
  marketData: MarketQuote[];
}

export interface OrderEvent extends BaseEvent {
  type: "order";
  updated: OrderState[];
  fill: Fill[];
}

export interface MetricsEvent extends BaseEvent {
  type: "metrics";
  report: MetricsReport;
}

export interface ExternalEvent extends BaseEvent {
  type: "external";
  source: string;
  data: unknown;
}

/**
 * WebSocket event wrapper with client routing.
 */
interface BaseWSEvent {
  type: "event";
  cid: string;
  timestamp: Date;
}

export interface MarketWSEvent extends BaseWSEvent {
  data: MarketEvent;
}

export interface OrderWSEvent extends BaseWSEvent {
  data: OrderEvent;
}

export interface MetricsWSEvent extends BaseWSEvent {
  data: MetricsEvent;
}

export interface ExternalWSEvent extends BaseWSEvent {
  data: ExternalEvent;
}

export type WSEvent =
  | MarketWSEvent
  | OrderWSEvent
  | MetricsWSEvent
  | ExternalWSEvent;

export interface LoginResult {
  connected: boolean;
  timestamp: Date;
}

export interface SubscribeResult {
  subscribed: string[];
}

export interface UnsubscribeResult {
  unsubscribed: string[];
}

export type GetPositionResult = Position;

export type GetOpenOrdersResult = OrderState[];

export interface ReplayResult {
  replay_finished: string;
  begin: Date;
  end: Date;
}
