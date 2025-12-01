import { BacktestBroker } from "./backtest.js";
import type { BacktestConfig } from "./schema/backtest.schema.js";

/**
 * Per-client session state.
 * Created upon login, destroyed upon logout.
 */
export class ClientState {
  readonly cid: string;
  readonly loginTimestamp: number;
  readonly subscriptions: Set<string> = new Set();
  readonly broker: BacktestBroker;

  constructor(cid: string, config: BacktestConfig, loginTimestamp: number) {
    this.cid = cid;
    this.loginTimestamp = loginTimestamp;
    this.broker = new BacktestBroker(config);
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
    this.broker.setTime(time);
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

  /**
   * Login creates a new client session.
   */
  login(cid: string, config: BacktestConfig, timestamp: number): ClientState {
    const client = new ClientState(cid, config, timestamp);
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
