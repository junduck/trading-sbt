import { z } from "zod";
import { BacktestConfigSchema } from "./backtest-config.schema.js";

const LoginRequestSchema = z.object({
  config: BacktestConfigSchema,
  // whether to send backtest events
  event: z.object({
    order: z.boolean().optional().default(true),
    position: z.boolean().optional().default(true),
    // corp action events, will send either CorpEvent or AdjEvent based on client config
    corp: z.boolean().optional().default(true),
    metrics: z.boolean().optional().default(true),
  }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

const LoginResponseWireSchema = z.object({
  connected: z.boolean(),
  timestamp: z.number(),
});

export type LoginResponseWire = z.infer<typeof LoginResponseWireSchema>;

export type LoginResponse = {
  connected: boolean;
  timestamp: Date;
};

export const login = {
  request: {
    validate: (wire: unknown) => {
      return LoginRequestSchema.safeParse(wire);
    },
    encode: (req: LoginRequest) => {
      return req;
    },
    decode: (wire: LoginRequest) => {
      return wire;
    },
  },

  response: {
    encode: (res: LoginResponse) => {
      const wire: LoginResponseWire = {
        connected: res.connected,
        timestamp: res.timestamp.getTime(),
      };
      return wire;
    },
    decode: (wire: LoginResponseWire) => {
      const res: LoginResponse = {
        connected: wire.connected,
        timestamp: new Date(wire.timestamp),
      };
      return res;
    },
  },
};
