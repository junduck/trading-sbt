import { z } from "zod";
import { OrderSchema, PartialOrderSchema } from "./order.schema.js";
import { BacktestConfigSchema } from "./backtest.schema.js";

export const InitParamsSchema = z.unknown().optional();

export const LoginParamsSchema = z.object({
  cid: z.string(),
  config: BacktestConfigSchema,
});

export const LogoutParamsSchema = z.object({
  cid: z.string(),
});

export const SubscribeParamsSchema = z.object({
  cid: z.string(),
  symbols: z.array(z.string()).min(1),
});

export const UnsubscribeParamsSchema = z.object({
  cid: z.string(),
  symbols: z.array(z.string()).min(1),
});

export const GetPositionParamsSchema = z.object({
  cid: z.string(),
});

export const GetOpenOrdersParamsSchema = z.object({
  cid: z.string(),
});

export const SubmitOrdersParamsSchema = z.object({
  cid: z.string(),
  orders: z.array(OrderSchema).min(1),
});

export const AmendOrdersParamsSchema = z.object({
  cid: z.string(),
  updates: z.array(PartialOrderSchema).min(1),
});

export const CancelOrdersParamsSchema = z.object({
  cid: z.string(),
  orderIds: z.array(z.string()).min(1),
});

export const CancelAllOrdersParamsSchema = z.object({
  cid: z.string(),
});

export const ReplayParamsSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  interval: z.number().positive(),
  replay_id: z.string(),
  table: z.string(),
});

export type InitParams = z.infer<typeof InitParamsSchema>;
export type LoginParams = z.infer<typeof LoginParamsSchema>;
export type LogoutParams = z.infer<typeof LogoutParamsSchema>;
export type SubscribeParams = z.infer<typeof SubscribeParamsSchema>;
export type UnsubscribeParams = z.infer<typeof UnsubscribeParamsSchema>;
export type GetPositionParams = z.infer<typeof GetPositionParamsSchema>;
export type GetOpenOrdersParams = z.infer<typeof GetOpenOrdersParamsSchema>;
export type SubmitOrdersParams = z.infer<typeof SubmitOrdersParamsSchema>;
export type AmendOrdersParams = z.infer<typeof AmendOrdersParamsSchema>;
export type CancelOrdersParams = z.infer<typeof CancelOrdersParamsSchema>;
export type CancelAllOrdersParams = z.infer<typeof CancelAllOrdersParamsSchema>;
export type ReplayParams = z.infer<typeof ReplayParamsSchema>;
