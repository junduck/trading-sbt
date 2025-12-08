import { z } from "zod";
import type { TableInfo } from "../shared/types.js";

const InitResponseWireSchema = z.object({
  tables: z.array(
    z.object({
      name: z.string(),
      startTime: z.number(),
      endTime: z.number(),
    })
  ),
});

export type InitResponseWire = z.infer<typeof InitResponseWireSchema>;

export type InitReponse = {
  tables: TableInfo[];
};

export const init = {
  request: {},
  response: {
    encode: (res: InitReponse) => {
      const wire: InitResponseWire = {
        tables: res.tables.map((item) => ({
          name: item.name,
          startTime: item.startTime.getTime(),
          endTime: item.endTime.getTime(),
        })),
      };
      return wire;
    },
    decode: (wire: InitResponseWire) => {
      const res: InitReponse = {
        tables: wire.tables.map((item) => ({
          name: item.name,
          startTime: new Date(item.startTime),
          endTime: new Date(item.endTime),
        })),
      };
      return res;
    },
  },
};
