import {
  appraisePosition,
  type MarketSnapshot,
  type Position,
} from "@junduck/trading-core";
import {
  RunningSharpe,
  RunningSortino,
  RunningWinRate,
  RunningGainLoss,
  RunningExpectancy,
  RunningProfitFactor,
  RunningDrawdown,
  RunningLongestDrawdown,
} from "@junduck/trading-core/online";
import type {
  MetricsReport,
  ReportType,
} from "./schema/metrics-report.schema.js";

export class BacktestMetrics {
  private sharpe: RunningSharpe;
  private sortino: RunningSortino;
  private winRate: RunningWinRate;
  private gainLoss: RunningGainLoss;
  private expectancy: RunningExpectancy;
  private profitFactor: RunningProfitFactor;

  private drawdown: RunningDrawdown;
  private drawdownDur: RunningLongestDrawdown;

  private initialCash: number;
  private prevEquity: number;

  constructor(initialCash: number, riskFree: number = 0) {
    this.initialCash = initialCash;
    this.prevEquity = initialCash;

    this.sharpe = new RunningSharpe({ riskfree: riskFree });
    this.sortino = new RunningSortino({ riskfree: riskFree });
    this.winRate = new RunningWinRate();
    this.gainLoss = new RunningGainLoss();
    this.expectancy = new RunningExpectancy();
    this.profitFactor = new RunningProfitFactor();

    this.drawdown = new RunningDrawdown();
    this.drawdownDur = new RunningLongestDrawdown();
  }

  reset() {
    this.sharpe.reset();
    this.sortino.reset();
    this.winRate.reset();
    this.gainLoss.reset();
    this.expectancy.reset();
    this.profitFactor.reset();

    this.drawdown.reset();
    this.drawdownDur.reset();

    this.prevEquity = this.initialCash;
  }

  update(pos: Position, snapshot: MarketSnapshot) {
    const equity = appraisePosition(pos, snapshot);
    const returns = (equity - this.prevEquity) / this.prevEquity;
    const timestamp = snapshot.timestamp;

    this.sharpe.update(returns);
    this.sortino.update(returns);
    this.drawdown.update(equity, timestamp);
    this.drawdownDur.update(equity, timestamp);

    this.prevEquity = equity;
  }

  report(
    reportType: ReportType,
    pos: Position,
    snapshot: MarketSnapshot,
    timestamp: Date
  ): MetricsReport {
    const equity = appraisePosition(pos, snapshot);
    const totalReturn = (equity - this.initialCash) / this.initialCash;

    const dd = this.drawdown.value;
    const ddDur = this.drawdownDur.value;

    return {
      reportType,
      timestamp,
      equity,
      totalReturn,
      sharpe: this.sharpe.value,
      sortino: this.sortino.value,
      winRate: this.winRate.value,
      avgGainLossRatio: this.gainLoss.value,
      expectancy: this.expectancy.value,
      profitFactor: this.profitFactor.value,
      maxDrawdown: dd?.max ?? 0,
      maxDrawdownDuration: ddDur?.longest ?? 0,
    };
  }
}
