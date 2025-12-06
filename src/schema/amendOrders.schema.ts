import {
  decodePartialOrder,
  encodePartialOrder,
  PartialOrderWireSchema,
  type PartialOrder,
} from "@junduck/trading-core-serdes";
import { z } from "zod";

// Request

const amendOrdersRequestWireSchema = z.array(PartialOrderWireSchema);

export type amendOrdersRequestWire = z.infer<
  typeof amendOrdersRequestWireSchema
>;

export type amendOrdersRequest = PartialOrder[];

// Response

export const amendOrders = {
  request: {
    validate: (wire: unknown) => {
      return amendOrdersRequestWireSchema.safeParse(wire);
    },
    encode: (req: amendOrdersRequest) => {
      return req.map((item) => encodePartialOrder(item));
    },
    decode: (wire: amendOrdersRequestWire) => {
      return wire.map((item) => decodePartialOrder(item));
    },
  },

  response: {
    encode: (res: number) => res,
    decode: (wire: number) => wire,
  },
};
