import { z } from "zod";

export const OrderTypeSchema = z.enum([
  "MARKET",
  "LIMIT",
  "STOP",
  "STOP_LIMIT",
]);

export const OrderSideSchema = z.enum(["BUY", "SELL"]);

export const PositionEffectSchema = z.enum([
  "OPEN_LONG",
  "CLOSE_LONG",
  "OPEN_SHORT",
  "CLOSE_SHORT",
]);

const BaseOrderSchema = z.object({
  id: z.string(), // assigned by client, validate uniqueness upon submission
  symbol: z.string(),
  side: OrderSideSchema,
  effect: PositionEffectSchema,
  quantity: z.number().positive(),
  created: z.any().optional(), // ignored, assigned replay time
});

export const MarketOrderSchema = BaseOrderSchema.extend({
  type: z.literal("MARKET"),
});

export const LimitOrderSchema = BaseOrderSchema.extend({
  type: z.literal("LIMIT"),
  price: z.number().positive(),
});

export const StopOrderSchema = BaseOrderSchema.extend({
  type: z.literal("STOP"),
  stopPrice: z.number().positive(),
});

export const StopLimitOrderSchema = BaseOrderSchema.extend({
  type: z.literal("STOP_LIMIT"),
  price: z.number().positive(),
  stopPrice: z.number().positive(),
});

export const OrderSchema = z.discriminatedUnion("type", [
  MarketOrderSchema,
  LimitOrderSchema,
  StopOrderSchema,
  StopLimitOrderSchema,
]);

export const PartialOrderSchema = z.object({
  id: z.string(),
  symbol: z.string().optional(),
  side: OrderSideSchema.optional(),
  effect: PositionEffectSchema.optional(),
  type: OrderTypeSchema.optional(),
  quantity: z.number().positive().optional(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  created: z.any().optional(), // ignored, assigned replay time
});
