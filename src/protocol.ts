import type {
  Position,
  OrderState,
  MarketQuote,
  Fill,
} from "@junduck/trading-core/trading";

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
  type: "market" | "external" | "order";
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

export interface ExternalEvent extends BaseEvent {
  type: "external";
  source: string;
  data: unknown;
}

/**
 * WebSocket event wrapper with client routing.
 * Each event includes `cid` to route to the correct client session.
 */
interface BaseWSEvent {
  type: "event";
  cid: string;
  timestamp: number;
}

export interface MarketWSEvent extends BaseWSEvent {
  data: MarketEvent;
}

export interface OrderWSEvent extends BaseWSEvent {
  data: OrderEvent;
}

export interface ExternalWSEvent extends BaseWSEvent {
  data: ExternalEvent;
}

export type WSEvent = MarketWSEvent | OrderWSEvent | ExternalWSEvent;

export interface LoginResult {
  connected: boolean;
  timestamp: number;
  epoch: "s" | "ms" | "us";
}

export interface SubscribeResult {
  subscribed: string[];
}

export interface UnsubscribeResult {
  unsubscribed: string[];
}

export type GetPositionResult = Position;

export type GetOpenOrdersResult = OrderState[];
