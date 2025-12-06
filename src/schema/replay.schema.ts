import { z } from "zod";

const SubscribeRequestWireSchema = z.object({
  table: z.string(),
  from: z.number(),
  to: z.number(),
  replayId: z.string(),
  replayInterval: z.number(),
  periodicReport: z.number().optional(),
  tradeReport: z.boolean().optional(),
  endOfDayReport: z.boolean().optional(),
  marketMultiplex: z.boolean().optional(),
});

export type ReplayRequestWire = z.infer<typeof SubscribeRequestWireSchema>;

export type ReplayRequest = {
  table: string;
  from: Date;
  to: Date;
  replayId: string;
  replayInterval: number;
  periodicReport?: number;
  tradeReport?: boolean;
  endOfDayReport?: boolean;
  marketMultiplex?: boolean;
};

const ReplayResponseWireSchema = z.object({
  replayId: z.string(),
  begin: z.number(),
  end: z.number(),
});

export type ReplayResponseWire = z.infer<typeof ReplayResponseWireSchema>;

export type ReplayResponse = {
  replayId: string;
  begin: Date;
  end: Date;
};

export const replay = {
  request: {
    validate: (wire: unknown) => {
      return SubscribeRequestWireSchema.safeParse(wire);
    },
    encode: (req: ReplayRequest) => {
      const wire: ReplayRequestWire = {
        table: req.table,
        from: req.from.getTime(),
        to: req.to.getTime(),
        replayId: req.replayId,
        replayInterval: req.replayInterval,
      };
      if (req.periodicReport !== undefined) {
        wire.periodicReport = req.periodicReport;
      }
      if (req.tradeReport !== undefined) {
        wire.tradeReport = req.tradeReport;
      }
      if (req.endOfDayReport !== undefined) {
        wire.endOfDayReport = req.endOfDayReport;
      }
      if (req.marketMultiplex !== undefined) {
        wire.marketMultiplex = req.marketMultiplex;
      }
      if (req.table !== undefined) {
        wire.table = req.table;
      }
      return wire;
    },
    decode: (wire: ReplayRequestWire) => {
      const req: ReplayRequest = {
        table: wire.table,
        from: new Date(wire.from),
        to: new Date(wire.to),
        replayId: wire.replayId,
        replayInterval: wire.replayInterval,
        periodicReport: wire.periodicReport ?? 0,
        tradeReport: wire.tradeReport ?? false,
        endOfDayReport: wire.endOfDayReport ?? false,
        marketMultiplex: wire.marketMultiplex ?? false,
      };
      return req;
    },
  },
  response: {
    encode: (res: ReplayResponse) => {
      const wire: ReplayResponseWire = {
        replayId: res.replayId,
        begin: res.begin.getTime(),
        end: res.end.getTime(),
      };
      return wire;
    },
    decode: (wire: ReplayResponseWire) => {
      const res: ReplayResponse = {
        replayId: wire.replayId,
        begin: new Date(wire.begin),
        end: new Date(wire.end),
      };
      return res;
    },
  },
};
