import { z } from "zod";

export const OrderTypeSchema = z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]);

export const OrderSideSchema = z.enum(["BUY", "SELL"]);

export const PositionEffectSchema = z.enum([
  "OPEN_LONG",
  "CLOSE_LONG",
  "OPEN_SHORT",
  "CLOSE_SHORT",
]);

const BaseOrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: OrderSideSchema,
  effect: PositionEffectSchema,
  quantity: z.number().positive(),
  created: z.number().optional(),
});

const validateOrderAction = (data: { side: string; effect: string }) => {
  if (data.side === "BUY") {
    return data.effect === "OPEN_LONG" || data.effect === "CLOSE_SHORT";
  }
  if (data.side === "SELL") {
    return data.effect === "CLOSE_LONG" || data.effect === "OPEN_SHORT";
  }
  return false;
};

export const MarketOrderSchema = BaseOrderSchema
  .extend({
    type: z.literal("MARKET"),
  })
  .refine(validateOrderAction, {
    message: "Invalid side/effect combination",
  });

export const LimitOrderSchema = BaseOrderSchema
  .extend({
    type: z.literal("LIMIT"),
    price: z.number().positive(),
  })
  .refine(validateOrderAction, {
    message: "Invalid side/effect combination",
  });

export const StopOrderSchema = BaseOrderSchema
  .extend({
    type: z.literal("STOP"),
    stopPrice: z.number().positive(),
  })
  .refine(validateOrderAction, {
    message: "Invalid side/effect combination",
  });

export const StopLimitOrderSchema = BaseOrderSchema
  .extend({
    type: z.literal("STOP_LIMIT"),
    price: z.number().positive(),
    stopPrice: z.number().positive(),
  })
  .refine(validateOrderAction, {
    message: "Invalid side/effect combination",
  });

export const OrderSchema = z.discriminatedUnion("type", [
  MarketOrderSchema,
  LimitOrderSchema,
  StopOrderSchema,
  StopLimitOrderSchema,
]);

export const PartialOrderSchema = z
  .object({
    id: z.string(),
    symbol: z.string().optional(),
    side: OrderSideSchema.optional(),
    effect: PositionEffectSchema.optional(),
    type: OrderTypeSchema.optional(),
    quantity: z.number().positive().optional(),
    price: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    created: z.number().optional(),
  })
  .refine(
    (data) => {
      if (data.side && data.effect) {
        if (data.side === "BUY") {
          return data.effect === "OPEN_LONG" || data.effect === "CLOSE_SHORT";
        }
        if (data.side === "SELL") {
          return data.effect === "CLOSE_LONG" || data.effect === "OPEN_SHORT";
        }
      }
      return true;
    },
    {
      message: "Invalid side/effect combination",
    }
  );
