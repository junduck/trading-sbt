import { z } from "zod";

export const MetricsReportWireSchema = z.object({
  reportType: z.enum(["PERIODIC", "TRADE", "ENDOFDAY"]),
  timestamp: z.number(),

  equity: z.number(),
  totalReturn: z.number(),

  sharpe: z.number(),
  sortino: z.number(),

  winRate: z.number(),
  avgGainLossRatio: z.number(),
  expectancy: z.number(),
  profitFactor: z.number(),

  maxDrawdown: z.number(),
  maxDrawdownDuration: z.number(),
});

export type MetricsReportWire = z.infer<typeof MetricsReportWireSchema>;

export type ReportType =
  | "PERIODIC" // Cumulative priodic report per N events
  | "TRADE" // Cumulative report per trade
  | "ENDOFDAY"; // Session end of day report

export type MetricsReport = {
  reportType: ReportType;
  timestamp: Date;

  equity: number;
  totalReturn: number;

  sharpe: number;
  sortino: number;

  winRate: number;
  avgGainLossRatio: number;
  expectancy: number;
  profitFactor: number;

  maxDrawdown: number;
  maxDrawdownDuration: number;
};

export function encodeMetricsReport(report: MetricsReport): MetricsReportWire {
  return {
    reportType: report.reportType,
    timestamp: report.timestamp.getTime(),

    equity: report.equity,
    totalReturn: report.totalReturn,

    sharpe: report.sharpe,
    sortino: report.sortino,

    winRate: report.winRate,
    avgGainLossRatio: report.avgGainLossRatio,
    expectancy: report.expectancy,
    profitFactor: report.profitFactor,

    maxDrawdown: report.maxDrawdown,
    maxDrawdownDuration: report.maxDrawdownDuration,
  };
}

export function decodeMetricsReport(wire: MetricsReportWire): MetricsReport {
  return {
    reportType: wire.reportType,
    timestamp: new Date(wire.timestamp),

    equity: wire.equity,
    totalReturn: wire.totalReturn,

    sharpe: wire.sharpe,
    sortino: wire.sortino,

    winRate: wire.winRate,
    avgGainLossRatio: wire.avgGainLossRatio,
    expectancy: wire.expectancy,
    profitFactor: wire.profitFactor,

    maxDrawdown: wire.maxDrawdown,
    maxDrawdownDuration: wire.maxDrawdownDuration,
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
