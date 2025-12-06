import type { OrderState } from "@junduck/trading-core";
import {
  decodeOrderState,
  encodeOrderState,
  type OrderStateWire,
} from "@junduck/trading-core-serdes";

export const getOpenOrders = {
  request: {},
  response: {
    encode: (res: OrderState[]) => {
      return res.map((item) => encodeOrderState(item));
    },
    decode: (wire: OrderStateWire[]) => {
      return wire.map((item) => decodeOrderState(item));
    },
  },
};
