import { z } from "zod";
import { BacktestConfigSchema } from "./backtest.schema.js";

const LoginRequestSchema = z.object({
  config: BacktestConfigSchema,
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
