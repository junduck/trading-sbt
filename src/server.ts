import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import { MarketDatabase } from "./database.js";
import type {
  Request,
  Response,
  WSEvent,
  LoginResult,
  SubscribeResult,
  UnsubscribeResult,
  GetPositionResult,
  GetOpenOrdersResult,
  ReplayResult,
  OrderWSEvent,
  MarketWSEvent,
} from "./protocol.js";
import type {
  LoginParams,
  LogoutParams,
  SubscribeParams,
  UnsubscribeParams,
  GetPositionParams,
  GetOpenOrdersParams,
  SubmitOrdersParams,
  AmendOrdersParams,
  CancelOrdersParams,
  CancelAllOrdersParams,
  ReplayParams,
} from "./schema/index.js";

export class Server {
  private readonly wss: WebSocketServer;
  private readonly connectionSessions = new WeakMap<WebSocket, Session>();
  private readonly activeReplays = new WeakMap<WebSocket, string>();
  private readonly db: MarketDatabase;
  get serverTime(): Date {
    return new Date();
  }
  playbackTime?: Date;

  constructor(port: number = 8080, dbPath?: string) {
    this.db = new MarketDatabase(dbPath);
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    console.log(`WebSocket server started on port ${port}`);
  }

  private handleConnection(ws: WebSocket): void {
    const session = new Session();
    this.connectionSessions.set(ws, session);

    console.log("Client connected");

    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, session, data.toString());
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      session.cleanup();
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }

  private handleMessage(ws: WebSocket, session: Session, data: string): void {
    try {
      const request: Request = JSON.parse(data);
      const { action, action_id, params } = request;

      const handler = this.handlers[action as keyof typeof this.handlers];
      if (!handler) {
        this.sendResponse(ws, action_id, undefined, {
          code: "INVALID_ACTION",
          message: `Unknown action: ${action}`,
        });
        return;
      }

      handler.call(this, session, ws, action_id, params);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  private sendResponse(
    ws: WebSocket,
    actionId: number,
    result?: unknown,
    error?: { code: string; message: string }
  ): void {
    const response: Response = error
      ? { type: "response", action_id: actionId, error }
      : { type: "response", action_id: actionId, result };
    ws.send(JSON.stringify(response));
  }

  sendEvent(ws: WebSocket, event: WSEvent): void {
    ws.send(JSON.stringify(event));
  }

  private handlers = {
    init(
      this: Server,
      _session: Session,
      ws: WebSocket,
      actionId: number,
      _params: unknown
    ): void {
      // TODO: implement init logic
      this.sendResponse(ws, actionId, {
        version: "1.0.0",
      });
    },

    login(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, config } = params as LoginParams;

      // TODO: validate params

      // Reject login during active replay
      if (this.activeReplays.has(ws)) {
        this.sendResponse(ws, actionId, undefined, {
          code: "REPLAY_ACTIVE",
          message: "Cannot login during active replay",
        });
        return;
      }

      session.login(cid, config, this.serverTime);

      const result: LoginResult = {
        connected: true,
        timestamp: this.serverTime,
      };

      this.sendResponse(ws, actionId, result);
    },

    logout(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid } = params as LogoutParams;

      // TODO: validate params

      session.logout(cid);

      this.sendResponse(ws, actionId, { connected: false });
    },

    subscribe(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, symbols } = params as SubscribeParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const subscribed = client.addSubscriptions(symbols);

      const result: SubscribeResult = { subscribed };
      this.sendResponse(ws, actionId, result);
    },

    unsubscribe(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, symbols } = params as UnsubscribeParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const unsubscribed = client.removeSubscriptions(symbols);

      const result: UnsubscribeResult = { unsubscribed };
      this.sendResponse(ws, actionId, result);
    },

    getPosition(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid } = params as GetPositionParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const result: GetPositionResult = client.broker.getPosition();
      this.sendResponse(ws, actionId, result);
    },

    getOpenOrders(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid } = params as GetOpenOrdersParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const result: GetOpenOrdersResult = client.broker.getOpenOrders();
      this.sendResponse(ws, actionId, result);
    },

    submitOrders(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, orders } = params as SubmitOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const updated = client.broker.submitOrder(orders as any);

      if (updated.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.serverTime,
          data: {
            type: "order",
            timestamp: this.serverTime,
            updated,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { submitted: updated.length });
    },

    amendOrders(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, updates } = params as AmendOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const updated = client.broker.amendOrder(updates as any);

      if (updated.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.serverTime,
          data: {
            type: "order",
            timestamp: this.serverTime,
            updated,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { amended: updated.length });
    },

    cancelOrders(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid, orderIds } = params as CancelOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const cancelled = client.broker.cancelOrder(orderIds);

      if (cancelled.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.serverTime,
          data: {
            type: "order",
            timestamp: this.serverTime,
            updated: cancelled,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { cancelled: cancelled.length });
    },

    cancelAllOrders(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const { cid } = params as CancelAllOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, {
          code: "INVALID_CLIENT",
          message: "Client not logged in",
        });
        return;
      }

      const cancelled = client.broker.cancelAllOrders();

      if (cancelled.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.serverTime,
          data: {
            type: "order",
            timestamp: this.serverTime,
            updated: cancelled,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { cancelled: cancelled.length });
    },

    async replay(
      this: Server,
      session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): Promise<void> {
      const { from, to, interval, replay_id } = params as ReplayParams;

      // Reject if there's already an active replay on this connection
      if (this.activeReplays.has(ws)) {
        this.sendResponse(ws, actionId, undefined, {
          code: "REPLAY_ALREADY_ACTIVE",
          message: "A replay is already active on this connection",
        });
        return;
      }

      // TODO: validate params

      // Collect all subscribed symbols from all clients on this connection
      const allSymbols = new Set<string>();
      for (const client of session.clients.values()) {
        for (const symbol of client.subscriptions) {
          allSymbols.add(symbol);
        }
      }

      const symbols = Array.from(allSymbols);

      // Convert ISO datetime to epoch seconds
      const fromEpoch = Math.floor(new Date(from).getTime() / 1000);
      const toEpoch = Math.floor(new Date(to).getTime() / 1000);

      // Mark replay as active
      this.activeReplays.set(ws, replay_id);

      // Create database instance for this replay with symbol filter
      const replayDb = new MarketDatabase(undefined, symbols);

      let actualBegin: Date | undefined;
      let actualEnd: Date | undefined;

      try {
        // Stream data using generator
        for (const batch of replayDb.replayData(fromEpoch, toEpoch)) {
          const { timestamp, data } = batch;
          const currentTime = new Date(timestamp * 1000);

          // Track actual time range
          if (!actualBegin) actualBegin = currentTime;
          actualEnd = currentTime;

          // Update broker time for all clients
          for (const client of session.clients.values()) {
            client.setTime(currentTime);
          }

          // Send market data to subscribed clients
          for (const client of session.clients.values()) {
            // Filter quotes for this client's subscriptions
            const clientData = data.filter((quote) =>
              client.subscriptions.has(quote.symbol)
            );

            if (clientData.length > 0) {
              const event: MarketWSEvent = {
                type: "event",
                cid: client.cid,
                timestamp: currentTime,
                data: {
                  type: "market",
                  timestamp: currentTime,
                  marketData: clientData,
                },
              };
              this.sendEvent(ws, event);
            }
          }

          // Backpressure control
          await new Promise((resolve) => setTimeout(resolve, interval));
        }

        // Send completion response
        const result: ReplayResult = {
          replay_finished: replay_id,
          begin: actualBegin ?? new Date(from),
          end: actualEnd ?? new Date(to),
        };

        this.sendResponse(ws, actionId, result);
      } finally {
        // Clean up
        replayDb.close();
        this.activeReplays.delete(ws);
      }
    },
  };

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.db.close();
        resolve();
      });
    });
  }
}

export function createServer(port: number = 8080, dbPath?: string): Server {
  return new Server(port, dbPath);
}
