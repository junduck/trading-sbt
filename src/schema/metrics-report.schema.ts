import { z } from "zod";

export const MetricsReportWireSchema = z.object({
  type: z.enum(["PERIODIC", "TRADE", "ENDOFDAY"]),
  timestamp: z.number(),
  metrics: z.record(z.string(), z.number()),
});

export type MetricsReportWire = z.infer<typeof MetricsReportWireSchema>;

export type ReportType =
  | "PERIODIC" // Cumulative periodic report per N events
  | "TRADE" // Cumulative report per trade
  | "ENDOFDAY"; // Session finish of day report

export type MetricsReport = {
  type: ReportType;
  timestamp: Date;
  metrics: Record<string, number>;
};

export function encodeMetricsReport(metrics: MetricsReport): MetricsReportWire {
  return {
    ...metrics,
    timestamp: metrics.timestamp.getTime(),
  };
}

export function decodeMetricsReport(wire: MetricsReportWire): MetricsReport {
  return {
    ...wire,
    timestamp: new Date(wire.timestamp),
  };
}

export const metricsReport = {
  validate: (wire: unknown) => {
    return MetricsReportWireSchema.safeParse(wire);
  },
  encode: (report: MetricsReport) => {
    return encodeMetricsReport(report);
  },
  decode: (wire: MetricsReportWire) => {
    return decodeMetricsReport(wire);
  },
};
