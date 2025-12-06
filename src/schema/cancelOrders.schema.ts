import { z } from "zod";

const cancelOrdersRequestSchema = z.array(z.string());

export type CancelOrdersRequest = z.infer<typeof cancelOrdersRequestSchema>;

export const cancelOrders = {
  request: {
    validate: (wire: unknown) => {
      return cancelOrdersRequestSchema.safeParse(wire);
    },
    encode: (req: CancelOrdersRequest) => req,
    decode: (wire: CancelOrdersRequest) => wire,
  },
  response: {
    encode: (res: number) => res,
    decode: (wire: number) => wire,
  },
};

export const cancelAllOrders = {
  request: {},
  response: {
    encode: (res: number) => res,
    decode: (wire: number) => wire,
  },
};
