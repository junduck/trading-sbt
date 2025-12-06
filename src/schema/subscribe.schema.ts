import { z } from "zod";

const SubscribeRequestSchema = z.object({
  symbols: z.array(z.string()),
});

export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

const SubscribeResponseSchema = z.object({
  subscribed: z.array(z.string()),
});

export type SubscribeResponse = z.infer<typeof SubscribeResponseSchema>;

const UnsubscribeRequestSchema = z.object({
  symbols: z.array(z.string()),
});

export type UnsubscribeRequest = z.infer<typeof UnsubscribeRequestSchema>;

const UnsubscribeResponseSchema = z.object({
  unsubscribed: z.array(z.string()),
});

export type UnsubscribeResponse = z.infer<typeof UnsubscribeResponseSchema>;

export const subscribe = {
  request: {
    validate: (wire: unknown) => {
      return SubscribeRequestSchema.safeParse(wire);
    },
    encode: (req: SubscribeRequest) => {
      return req;
    },
    decode: (wire: SubscribeRequest) => {
      return wire;
    },
  },

  response: {
    encode: (res: SubscribeResponse) => {
      return res;
    },
    decode: (wire: SubscribeResponse) => {
      return wire;
    },
  },
};

export const unsubscribe = {
  request: {
    validate: (wire: unknown) => {
      return UnsubscribeRequestSchema.safeParse(wire);
    },
    encode: (req: UnsubscribeRequest) => {
      return req;
    },
    decode: (wire: UnsubscribeRequest) => {
      return wire;
    },
  },

  response: {
    encode: (res: UnsubscribeResponse) => {
      return res;
    },
    decode: (wire: UnsubscribeResponse) => {
      return wire;
    },
  },
};
