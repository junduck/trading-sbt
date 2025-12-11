import { BacktestMetrics } from "../backtest/backtest-metrics.js";
import { BacktestBroker } from "../backtest/backtest-broker.js";
import type { BacktestConfig } from "../schema/backtest-config.schema.js";
import type { MarketQuote, MarketSnapshot } from "@junduck/trading-core";
import { serverTime, toEpoch } from "../shared/utils.js";
import type { SbtEvent } from "../schema/event.schema.js";
import type { TimeRep } from "../schema/data-source.schema.js";

/**
 * Per-client session state.
 * Created upon login, destroyed upon logout.
 */
export class ClientState {
  readonly cid: string;
  readonly subscriptions: Set<string> = new Set();
  readonly broker: BacktestBroker;
  readonly timeRep: TimeRep;

  private periodicMetrics: BacktestMetrics;
  private tradeMetrics: BacktestMetrics;
  private eodMetrics: BacktestMetrics;

  private reportPeriod: number = 0;
  private tradeReport: boolean = false;
  private eodReport: boolean = false;
  private eventCounter: number = 0;
  private currentDay: number = -1;

  private currentReplayTime: Date = new Date(0);

  constructor(cid: string, config: BacktestConfig, timeRep: TimeRep) {
    this.cid = cid;
    this.broker = new BacktestBroker(config);
    this.timeRep = timeRep;

    const initialCash = config.initialCash;
    const riskFree = config.riskFree ?? 0;

    this.periodicMetrics = new BacktestMetrics(initialCash, riskFree);
    this.tradeMetrics = new BacktestMetrics(initialCash, 0);
    this.eodMetrics = new BacktestMetrics(initialCash, riskFree);
  }

  addSubscriptions(symbols: string[]): string[] {
    for (const symbol of symbols) {
      this.subscriptions.add(symbol);
    }
    return symbols;
  }

  removeSubscriptions(symbols: string[]): string[] {
    const removed: string[] = [];
    for (const symbol of symbols) {
      if (this.subscriptions.delete(symbol)) {
        removed.push(symbol);
      }
    }
    return removed;
  }

  setTime(time: Date) {
    this.currentReplayTime = time;
    this.broker.setTime(time);
  }

  setReport(periodic: number, trade: boolean, eod: boolean) {
    this.reportPeriod = periodic;
    this.tradeReport = trade;
    this.eodReport = eod;
  }

  processOrderUpdate(
    data: MarketQuote[],
    snapshot: MarketSnapshot
  ): SbtEvent[] {
    const events: SbtEvent[] = [];

    const { updated, filled } = this.broker.processOpenOrders(data);

    if (updated.length > 0) {
      events.push({
        type: "order",
        timestamp: serverTime(),
        updated,
        fill: filled,
      });

      const position = this.broker.getPosition();

      // Update trade-biased metrics on fill events
      if (this.tradeReport && filled.length > 0) {
        this.tradeMetrics.update(position, snapshot);

        const tradeReport = this.tradeMetrics.report(
          "TRADE",
          position,
          snapshot,
          this.currentReplayTime
        );
        events.push({
          type: "metrics",
          timestamp: serverTime(),
          report: tradeReport,
        });
      }
    }

    return events;
  }

  processMarketData(
    _data: MarketQuote[],
    snapshot: MarketSnapshot
  ): SbtEvent[] {
    const events: SbtEvent[] = [];

    const position = this.broker.getPosition();
    const day = toEpoch(snapshot.timestamp, {
      epochUnit: "days",
      timezone: this.timeRep.timezone,
    });

    // Check for day change (EOD detection)
    if (this.eodReport && this.currentDay !== -1 && day > this.currentDay) {
      // Emit EOD report for previous day
      const eodReport = this.eodMetrics.report(
        "ENDOFDAY",
        position,
        snapshot,
        this.currentReplayTime
      );
      events.push({
        type: "metrics",
        timestamp: serverTime(),
        report: eodReport,
      });
      // Reset EOD metrics for new day
      this.eodMetrics.reset();
    }
    this.currentDay = day;

    // Update metrics (both periodic and EOD on every market data)
    this.periodicMetrics.update(position, snapshot);
    this.eodMetrics.update(position, snapshot);
    this.eventCounter++;

    // Emit periodic report every N events if configured
    if (this.reportPeriod > 0 && this.eventCounter % this.reportPeriod === 0) {
      const periodicReport = this.periodicMetrics.report(
        "PERIODIC",
        position,
        snapshot,
        this.currentReplayTime
      );
      events.push({
        type: "metrics",
        timestamp: serverTime(),
        report: periodicReport,
      });
    }

    return events;
  }
}

/**
 * WebSocket connection session.
 * Manages multiple clients over a single connection with request tracking.
 */
export class Session {
  readonly clients: Map<string, ClientState> = new Map();

  /**
   * Tracks pending requests to correlate responses.
   * Maps action_id -> request metadata
   */
  readonly pendingRequests: Map<number, unknown> = new Map();

  readonly timeRep: TimeRep;

  constructor(timeRep: TimeRep) {
    this.timeRep = timeRep;
  }

  /**
   * Login creates a new client session.
   */
  login(cid: string, config: BacktestConfig): ClientState {
    const client = new ClientState(cid, config, this.timeRep);
    this.clients.set(cid, client);
    return client;
  }

  /**
   * Logout removes a client session.
   */
  logout(cid: string): boolean {
    return this.clients.delete(cid);
  }

  getClient(cid: string): ClientState | undefined {
    return this.clients.get(cid);
  }

  /**
   * Register a pending request for correlation tracking.
   */
  registerRequest(actionId: number, metadata?: unknown): void {
    this.pendingRequests.set(actionId, metadata);
  }

  /**
   * Complete a request and remove it from pending.
   */
  completeRequest(actionId: number): unknown {
    const metadata = this.pendingRequests.get(actionId);
    this.pendingRequests.delete(actionId);
    return metadata;
  }

  /**
   * Cleanup all client sessions on disconnect.
   */
  cleanup(): void {
    this.clients.clear();
    this.pendingRequests.clear();
  }
}
