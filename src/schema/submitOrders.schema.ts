import type { Order } from "@junduck/trading-core";
import {
  decodeOrder,
  encodeOrder,
  OrderWireSchema,
} from "@junduck/trading-core-serdes";
import { z } from "zod";

const submitOrderRequestWireSchema = z.array(OrderWireSchema);

export type SubmitOrderRequestWire = z.infer<
  typeof submitOrderRequestWireSchema
>;

export type SubmitOrderRequest = Order[];

export const submitOrders = {
  request: {
    validate: (wire: SubmitOrderRequestWire) => {
      return submitOrderRequestWireSchema.safeParse(wire);
    },
    encode: (req: SubmitOrderRequest) => {
      return req.map((item) => encodeOrder(item));
    },
    decode: (wire: SubmitOrderRequestWire) => {
      return wire.map((item) => decodeOrder(item));
    },
  },

  response: {
    encode: (res: number) => res,
    decode: (wire: number) => wire,
  },
};
