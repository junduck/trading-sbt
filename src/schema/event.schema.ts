import type { Fill, MarketQuote, OrderState } from "@junduck/trading-core";
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
} from "@junduck/trading-core-serdes";
import { z } from "zod";
import {
  decodeMetricsReport,
  encodeMetricsReport,
  MetricsReportWireSchema,
  type MetricsReport,
} from "./metrics-report.schema.js";

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

// corporate actions

export const CorpActionSchema = z.object({
  symbol: z.string(),
  splitRatio: z.number().optional(), // split per share, 2 for 2-for-1 split
  dividendRate: z.number().optional(), // dividend per share
});

export type CorpAction = z.infer<typeof CorpActionSchema>;

export const AdjFactorSchema = z.object({
  symbol: z.string(),
  adjFactor: z.number(),
});

export type AdjFactor = z.infer<typeof AdjFactorSchema>;

export const CorpEventWireSchema = z.object({
  type: z.literal("corp"),
  timestamp: z.number(),
  action: z.array(CorpActionSchema).optional(),
  adjust: z.array(AdjFactorSchema).optional(),
});

export type CorpEventWire = z.infer<typeof CorpEventWireSchema>;

export type CorpEvent = {
  type: "corp";
  timestamp: Date;
  action: CorpAction[];
};

export const corpEvent = {
  validate: (wire: unknown) => {
    return CorpEventWireSchema.safeParse(wire);
  },
  encode: (event: CorpEvent) => {
    return {
      type: "corp",
      timestamp: event.timestamp.getTime(),
      action: event.action,
    } as CorpEventWire;
  },
  decode: (wire: CorpEventWire) => {
    return {
      type: "corp",
      timestamp: new Date(wire.timestamp),
      action: wire.action,
    } as CorpEvent;
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

// external

export const ExternalEventWireSchema = z.object({
  type: z.literal("external"),
  timestamp: z.number(),
  source: z.string(),
  data: z.unknown(),
});

export type ExternalEventWire = z.infer<typeof ExternalEventWireSchema>;

export type ExternalEvent = {
  type: "external";
  timestamp: Date;
  source: string;
  data: unknown;
};

export const externalEvent = {
  validate: (wire: unknown) => {
    return ExternalEventWireSchema.safeParse(wire);
  },
  encode: (event: ExternalEvent) => {
    return {
      type: "external",
      timestamp: event.timestamp.getTime(),
      source: event.source,
      data: event.data,
    } as ExternalEventWire;
  },
  decode: (wire: ExternalEventWire) => {
    return {
      type: "external",
      timestamp: new Date(wire.timestamp),
      source: wire.source,
      data: wire.data,
    } as ExternalEvent;
  },
};

// union

export const EventWireSchema = z.discriminatedUnion("type", [
  MarketEventWireSchema,
  OrderEventWireSchema,
  MetricsEventWireSchema,
  ExternalEventWireSchema,
]);

export type SbtEventWire = z.infer<typeof EventWireSchema>;

export type SbtEvent = MarketEvent | OrderEvent | MetricsEvent | ExternalEvent;

export const sbtEvent = {
  validate: (wire: unknown) => {
    return EventWireSchema.safeParse(wire);
  },
  encode: (evt: SbtEvent): SbtEventWire => {
    switch (evt.type) {
      case "market":
        return marketEvent.encode(evt);
      case "order":
        return orderEvent.encode(evt);
      case "metrics":
        return metricsEvent.encode(evt);
      case "external":
        return externalEvent.encode(evt);
    }
  },
  decode: (wire: SbtEventWire): SbtEvent => {
    switch (wire.type) {
      case "market":
        return marketEvent.decode(wire);
      case "order":
        return orderEvent.decode(wire);
      case "metrics":
        return metricsEvent.decode(wire);
      case "external":
        return externalEvent.decode(wire);
    }
  },
};
