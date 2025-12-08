import { z } from "zod";

const SubscribeRequestWireSchema = z.object({
  table: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  replayId: z.string(),
  replayInterval: z.number(),
  periodicReport: z.number().nullable().optional(),
  tradeReport: z.boolean().nullable().optional(),
  endOfDayReport: z.boolean().nullable().optional(),
  marketMultiplex: z.boolean().nullable().optional(),
});

export type ReplayRequestWire = z.infer<typeof SubscribeRequestWireSchema>;

export type ReplayRequest = {
  table: string;
  startTime: Date;
  endTime: Date;
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
  finish: z.number(),
});

export type ReplayResponseWire = z.infer<typeof ReplayResponseWireSchema>;

export type ReplayResponse = {
  replayId: string;
  begin: Date;
  finish: Date;
};

export const replay = {
  request: {
    validate: (wire: unknown) => {
      return SubscribeRequestWireSchema.safeParse(wire);
    },
    encode: (req: ReplayRequest) => {
      const wire: ReplayRequestWire = {
        table: req.table,
        startTime: req.startTime.getTime(),
        endTime: req.endTime.getTime(),
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
        startTime: new Date(wire.startTime),
        endTime: new Date(wire.endTime),
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
        finish: res.finish.getTime(),
      };
      return wire;
    },
    decode: (wire: ReplayResponseWire) => {
      const res: ReplayResponse = {
        replayId: wire.replayId,
        begin: new Date(wire.begin),
        finish: new Date(wire.finish),
      };
      return res;
    },
  },
};
