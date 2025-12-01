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
import {
  InitParamsSchema,
  LoginParamsSchema,
  LogoutParamsSchema,
  SubscribeParamsSchema,
  UnsubscribeParamsSchema,
  GetPositionParamsSchema,
  GetOpenOrdersParamsSchema,
  SubmitOrdersParamsSchema,
  AmendOrdersParamsSchema,
  CancelOrdersParamsSchema,
  CancelAllOrdersParamsSchema,
  ReplayParamsSchema,
} from "./schema/index.js";

export class Server {
  private readonly wss: WebSocketServer;
  private readonly connectionSessions = new WeakMap<WebSocket, Session>();
  private readonly activeReplays = new WeakMap<WebSocket, string>();
  private readonly db: MarketDatabase;
  get serverTime(): Date {
    return new Date();
  }

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

  /**
   * Validate params against a Zod schema and send error response if invalid.
   * Returns validated params if successful, undefined if validation failed.
   */
  private validateParams<T>(
    ws: WebSocket,
    actionId: number,
    params: unknown,
    schema: any
  ): T | undefined {
    const result = schema.safeParse(params);
    if (!result.success) {
      this.sendResponse(ws, actionId, undefined, {
        code: "INVALID_PARAMS",
        message: result.error.errors
          .map((e: any) => `${e.path.join(".")}: ${e.message}`)
          .join(", "),
      });
      return undefined;
    }
    return result.data;
  }

  private handlers = {
    init(
      this: Server,
      _session: Session,
      ws: WebSocket,
      actionId: number,
      params: unknown
    ): void {
      const validated = this.validateParams(
        ws,
        actionId,
        params,
        InitParamsSchema
      );
      if (validated === undefined && params !== undefined) return;

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
      const validated = this.validateParams<LoginParams>(
        ws,
        actionId,
        params,
        LoginParamsSchema
      );
      if (!validated) return;

      const { cid, config } = validated;

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
      const validated = this.validateParams<LogoutParams>(
        ws,
        actionId,
        params,
        LogoutParamsSchema
      );
      if (!validated) return;

      const { cid } = validated;

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
      const validated = this.validateParams<SubscribeParams>(
        ws,
        actionId,
        params,
        SubscribeParamsSchema
      );
      if (!validated) return;

      const { cid, symbols } = validated;

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
      const validated = this.validateParams<UnsubscribeParams>(
        ws,
        actionId,
        params,
        UnsubscribeParamsSchema
      );
      if (!validated) return;

      const { cid, symbols } = validated;

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
      const validated = this.validateParams<GetPositionParams>(
        ws,
        actionId,
        params,
        GetPositionParamsSchema
      );
      if (!validated) return;

      const { cid } = validated;

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
      const validated = this.validateParams<GetOpenOrdersParams>(
        ws,
        actionId,
        params,
        GetOpenOrdersParamsSchema
      );
      if (!validated) return;

      const { cid } = validated;

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
      const validated = this.validateParams<SubmitOrdersParams>(
        ws,
        actionId,
        params,
        SubmitOrdersParamsSchema
      );
      if (!validated) return;

      const { cid, orders } = validated;

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
      const validated = this.validateParams<AmendOrdersParams>(
        ws,
        actionId,
        params,
        AmendOrdersParamsSchema
      );
      if (!validated) return;

      const { cid, updates } = validated;

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
      const validated = this.validateParams<CancelOrdersParams>(
        ws,
        actionId,
        params,
        CancelOrdersParamsSchema
      );
      if (!validated) return;

      const { cid, orderIds } = validated;

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
      const validated = this.validateParams<CancelAllOrdersParams>(
        ws,
        actionId,
        params,
        CancelAllOrdersParamsSchema
      );
      if (!validated) return;

      const { cid } = validated;

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
      const validated = this.validateParams<ReplayParams>(
        ws,
        actionId,
        params,
        ReplayParamsSchema
      );
      if (!validated) return;

      const { from, to, interval, replay_id, table } = validated;

      // Reject if there's already an active replay on this connection
      if (this.activeReplays.has(ws)) {
        this.sendResponse(ws, actionId, undefined, {
          code: "REPLAY_ALREADY_ACTIVE",
          message: "A replay is already active on this connection",
        });
        return;
      }

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

      // Create database instance for this replay with symbol filter and table
      const replayDb = new MarketDatabase(undefined, symbols, table);

      const replayBegin = this.serverTime;

      try {
        // Stream data using generator
        for (const batch of replayDb.replayData(fromEpoch, toEpoch)) {
          const { timestamp, data } = batch;
          const replayTime = new Date(timestamp * 1000);

          // Update broker time for all clients
          for (const client of session.clients.values()) {
            client.setTime(replayTime);
          }

          // Step 1: Process pending orders for all clients and send order events
          for (const client of session.clients.values()) {
            // Filter quotes for this client's subscriptions
            const clientData = data.filter((quote) =>
              client.subscriptions.has(quote.symbol)
            );

            client.broker.setTime(replayTime);

            if (clientData.length > 0) {
              // Process pending orders with market data
              const { updated, filled } =
                client.broker.processPendingOrders(clientData);

              // Send order event if there are updates
              if (updated.length > 0) {
                const event: OrderWSEvent = {
                  type: "event",
                  cid: client.cid,
                  timestamp: this.serverTime,
                  data: {
                    type: "order",
                    timestamp: this.serverTime,
                    updated,
                    fill: filled,
                  },
                };
                this.sendEvent(ws, event);
              }
            }
          }

          // Step 2: Send market data to subscribed clients
          for (const client of session.clients.values()) {
            // Filter quotes for this client's subscriptions
            const clientData = data.filter((quote) =>
              client.subscriptions.has(quote.symbol)
            );

            if (clientData.length > 0) {
              const event: MarketWSEvent = {
                type: "event",
                cid: client.cid,
                timestamp: this.serverTime,
                data: {
                  type: "market",
                  timestamp: this.serverTime,
                  marketData: clientData,
                },
              };
              this.sendEvent(ws, event);
            }
          }

          // Backpressure control
          await new Promise((resolve) => setTimeout(resolve, interval));
        }

        const replayEnd = this.serverTime;

        // Send completion response
        const result: ReplayResult = {
          replay_finished: replay_id,
          begin: replayBegin,
          end: replayEnd,
        };

        this.sendResponse(ws, actionId, result);
      } catch (error) {
        // Send error response to client
        this.sendResponse(ws, actionId, undefined, {
          code: "REPLAY_ERROR",
          message: error instanceof Error ? error.message : "Unknown replay error",
        });
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
