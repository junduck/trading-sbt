import { z } from "zod";
import type { TableInfo } from "../types.js";

const InitRequestWireSchema = z.object({});

export type InitRequestWire = z.infer<typeof InitRequestWireSchema>;

export type InitRequest = {};

const InitResponseWireSchema = z.object({
  replayTables: z.array(
    z.object({
      name: z.string(),
      from: z.number(),
      to: z.number(),
    })
  ),
});

export type InitResponseWire = z.infer<typeof InitResponseWireSchema>;

export type InitReponse = {
  replayTables: TableInfo[];
};

export const init = {
  request: {},
  response: {
    encode: (res: InitReponse) => {
      const wire: InitResponseWire = {
        replayTables: res.replayTables.map((item) => ({
          name: item.name,
          from: item.from.getTime(),
          to: item.to.getTime(),
        })),
      };
      return wire;
    },
    decode: (wire: InitResponseWire) => {
      const res: InitReponse = {
        replayTables: wire.replayTables.map((item) => ({
          name: item.name,
          from: new Date(item.from),
          to: new Date(item.to),
        })),
      };
      return res;
    },
  },
};
