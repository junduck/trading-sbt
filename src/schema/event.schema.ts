import type {
  Fill,
  MarketQuote,
  OrderState,
  Position,
} from "@junduck/trading-core/trading";
import {
  decodeMarketQuote,
  encodeMarketQuote,
  MarketQuoteWireSchema,
  OrderStateWireSchema,
  FillWireSchema,
  decodeOrderState,
  encodeOrderState,
  decodeFill,
  encodeFill,
  PositionWireSchema,
  encodePosition,
  decodePosition,
} from "@junduck/trading-core-serdes";
import { z } from "zod";
import {
  decodeMetricsReport,
  encodeMetricsReport,
  MetricsReportWireSchema,
  type MetricsReport,
} from "./metrics-report.schema.js";

// generic event

export const GenericEventDataSchema = z
  .object({
    // symbol identifier, required
    symbol: z.string(),
  })
  .and(z.record(z.string(), z.unknown()));

const GenericEventWireSchema = z.object({
  // event type discriminator
  type: z.string(),
  // epoch timestamp in milliseconds, event timestamp
  timestamp: z.number(),
  // event data payload
  data: z.array(GenericEventDataSchema),
});

export type GenericEventData = z.infer<typeof GenericEventDataSchema>;

export type GenericEventWire = z.infer<typeof GenericEventWireSchema>;

export type GenericEvent = {
  type: string;
  timestamp: Date;
  data: Array<GenericEventData>;
};

export const genericEvent = {
  validate: (wire: unknown) => {
    return GenericEventWireSchema.safeParse(wire);
  },
  encode: (event: GenericEvent) => {
    return {
      type: event.type,
      timestamp: event.timestamp.getTime(),
      data: event.data,
    } as GenericEventWire;
  },
  decode: (wire: GenericEventWire) => {
    return {
      type: wire.type,
      timestamp: new Date(wire.timestamp),
      data: wire.data,
    } as GenericEvent;
  },
};

// market

const MarketEventWireSchema = z.object({
  type: z.literal("market"),
  timestamp: z.number(),
  data: z.array(MarketQuoteWireSchema),
});

export type MarketEventWire = z.infer<typeof MarketEventWireSchema>;

export type MarketEvent = {
  type: "market";
  timestamp: Date;
  data: MarketQuote[];
};

export const marketEvent = {
  validate: (wire: unknown) => {
    return MarketEventWireSchema.safeParse(wire);
  },
  encode: (event: MarketEvent) => {
    return {
      type: "market",
      timestamp: event.timestamp.getTime(),
      data: event.data.map((item) => encodeMarketQuote(item)),
    } as MarketEventWire;
  },
  decode: (wire: MarketEventWire) => {
    return {
      type: "market",
      timestamp: new Date(wire.timestamp),
      data: wire.data.map((item) => decodeMarketQuote(item)),
    } as MarketEvent;
  },
};

// order

const OrderEventWireSchema = z.object({
  type: z.literal("order"),
  timestamp: z.number(),
  updated: z.array(OrderStateWireSchema),
  fill: z.array(FillWireSchema),
});

export type OrderEventWire = z.infer<typeof OrderEventWireSchema>;

export type OrderEvent = {
  type: "order";
  timestamp: Date;
  updated: OrderState[];
  fill: Fill[];
};

export const orderEvent = {
  validate: (wire: unknown) => {
    return OrderEventWireSchema.safeParse(wire);
  },
  encode: (event: OrderEvent) => {
    return {
      type: "order",
      timestamp: event.timestamp.getTime(),
      updated: event.updated.map((item) => encodeOrderState(item)),
      fill: event.fill.map((item) => encodeFill(item)),
    } as OrderEventWire;
  },
  decode: (wire: OrderEventWire) => {
    return {
      type: "order",
      timestamp: new Date(wire.timestamp),
      updated: wire.updated.map((item) => decodeOrderState(item)),
      fill: wire.fill.map((item) => decodeFill(item)),
    } as OrderEvent;
  },
};

// position

const PositionEventWireSchema = z.object({
  type: z.literal("position"),
  timestamp: z.number(),
  position: PositionWireSchema,
});

export type PositionEventWire = z.infer<typeof PositionEventWireSchema>;

export type PositionEvent = {
  type: "position";
  timestamp: Date;
  position: Position;
};

export const positionEvent = {
  validate: (wire: unknown) => {
    return PositionEventWireSchema.safeParse(wire);
  },
  encode: (event: PositionEvent) => {
    return {
      type: "position",
      timestamp: event.timestamp.getTime(),
      position: encodePosition(event.position),
    } as PositionEventWire;
  },
  decode: (wire: PositionEventWire) => {
    return {
      type: "position",
      timestamp: new Date(wire.timestamp),
      position: decodePosition(wire.position),
    } as PositionEvent;
  },
};

// corp action, treated as generic event

export const CorpActionSchema = z.object({
  symbol: z.string(),
  splitRatio: z.number().optional(), // split per share, 2 for 2-for-1 split
  dividendRate: z.number().optional(), // dividend per share
});

export type CorpAction = z.infer<typeof CorpActionSchema>;

const CorpEventWireSchema = z.object({
  type: z.literal("corp"),
  timestamp: z.number(),
  data: z.array(CorpActionSchema),
});

export type CorpEventWire = z.infer<typeof CorpEventWireSchema>;

export type CorpEvent = {
  type: "corp";
  timestamp: Date;
  data: CorpAction[];
};

export const corpEvent = {
  validate: (wire: unknown) => {
    return CorpEventWireSchema.safeParse(wire);
  },
  encode: (event: CorpEvent) => {
    return {
      type: "corp",
      timestamp: event.timestamp.getTime(),
      data: event.data,
    } as CorpEventWire;
  },
  decode: (wire: CorpEventWire) => {
    return {
      type: "corp",
      timestamp: new Date(wire.timestamp),
      data: wire.data,
    } as CorpEvent;
  },
};

// adjustment, treated as generic event

export const AdjSchema = z.object({
  symbol: z.string(),
  factor: z.number(), // adjustment factor
});

export type Adj = z.infer<typeof AdjSchema>;

const AdjEventWireSchema = z.object({
  type: z.literal("adj"),
  timestamp: z.number(),
  data: z.array(AdjSchema),
});

export type AdjEventWire = z.infer<typeof AdjEventWireSchema>;

export type AdjEvent = {
  type: "adj";
  timestamp: Date;
  data: Adj[];
};

export const adjEvent = {
  validate: (wire: unknown) => {
    return AdjEventWireSchema.safeParse(wire);
  },
  encode: (event: AdjEvent) => {
    return {
      type: "adj",
      timestamp: event.timestamp.getTime(),
      data: event.data,
    } as AdjEventWire;
  },
  decode: (wire: AdjEventWire) => {
    return {
      type: "adj",
      timestamp: new Date(wire.timestamp),
      data: wire.data,
    } as AdjEvent;
  },
};

// metrics

export const MetricsEventWireSchema = z.object({
  type: z.literal("metrics"),
  timestamp: z.number(),
  report: MetricsReportWireSchema,
});

export type MetricsEventWire = z.infer<typeof MetricsEventWireSchema>;

export type MetricsEvent = {
  type: "metrics";
  timestamp: Date;
  report: MetricsReport;
};

export const metricsEvent = {
  validate: (wire: unknown) => {
    return MetricsEventWireSchema.safeParse(wire);
  },
  encode: (event: MetricsEvent) => {
    return {
      type: "metrics",
      timestamp: event.timestamp.getTime(),
      report: encodeMetricsReport(event.report),
    } as MetricsEventWire;
  },
  decode: (wire: MetricsEventWire) => {
    return {
      type: "metrics",
      timestamp: new Date(wire.timestamp),
      report: decodeMetricsReport(wire.report),
    } as MetricsEvent;
  },
};

// union

export type SbtEvent =
  | GenericEvent
  | MarketEvent
  | OrderEvent
  | PositionEvent
  | CorpEvent
  | MetricsEvent;
