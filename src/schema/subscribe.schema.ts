import { z } from "zod";

const SubRequestSchema = z.array(z.string());

export type SubRequest = z.infer<typeof SubRequestSchema>;

export const subscribe = {
  request: {
    validate: (wire: unknown) => {
      return SubRequestSchema.safeParse(wire);
    },
    encode: (req: SubRequest) => {
      return req;
    },
    decode: (wire: SubRequest) => {
      return wire;
    },
  },

  response: {
    encode: (res: SubRequest) => {
      return res;
    },
    decode: (wire: SubRequest) => {
      return wire;
    },
  },
};

export const unsubscribe = subscribe;
