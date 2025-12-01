import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import type { Request, Response, WSEvent, LoginResult, SubscribeResult, UnsubscribeResult, GetPositionResult, GetOpenOrdersResult, OrderWSEvent } from "./protocol.js";
import type { LoginParams, LogoutParams, SubscribeParams, UnsubscribeParams, GetPositionParams, GetOpenOrdersParams, SubmitOrdersParams, AmendOrdersParams, CancelOrdersParams, CancelAllOrdersParams } from "./schema/index.js";

export class Server {
  private readonly wss: WebSocketServer;
  private readonly connectionSessions = new WeakMap<WebSocket, Session>();
  readonly epoch: "s" | "ms" | "us" = "ms";

  constructor(port: number = 8080) {
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

  private sendResponse(ws: WebSocket, actionId: number, result?: unknown, error?: { code: string; message: string }): void {
    const response: Response = error
      ? { type: "response", action_id: actionId, error }
      : { type: "response", action_id: actionId, result };
    ws.send(JSON.stringify(response));
  }

  sendEvent(ws: WebSocket, event: WSEvent): void {
    ws.send(JSON.stringify(event));
  }

  private getTimestamp(): number {
    const now = Date.now();
    if (this.epoch === "s") return Math.floor(now / 1000);
    if (this.epoch === "us") return now * 1000;
    return now;
  }

  private handlers = {
    init(this: Server, _session: Session, ws: WebSocket, actionId: number, _params: unknown): void {
      // TODO: implement init logic
      this.sendResponse(ws, actionId, {
        version: "1.0.0",
        epoch: this.epoch,
      });
    },

    login(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, config } = params as LoginParams;

      // TODO: validate params

      const timestamp = this.getTimestamp();
      session.login(cid, config, timestamp);

      const result: LoginResult = {
        connected: true,
        timestamp,
        epoch: this.epoch,
      };

      this.sendResponse(ws, actionId, result);
    },

    logout(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid } = params as LogoutParams;

      // TODO: validate params

      session.logout(cid);

      this.sendResponse(ws, actionId, { connected: false });
    },

    subscribe(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, symbols } = params as SubscribeParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const subscribed = client.addSubscriptions(symbols);

      const result: SubscribeResult = { subscribed };
      this.sendResponse(ws, actionId, result);
    },

    unsubscribe(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, symbols } = params as UnsubscribeParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const unsubscribed = client.removeSubscriptions(symbols);

      const result: UnsubscribeResult = { unsubscribed };
      this.sendResponse(ws, actionId, result);
    },

    getPosition(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid } = params as GetPositionParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const result: GetPositionResult = client.broker.getPosition();
      this.sendResponse(ws, actionId, result);
    },

    getOpenOrders(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid } = params as GetOpenOrdersParams;

      // TODO: validate params

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const result: GetOpenOrdersResult = client.broker.getOpenOrders();
      this.sendResponse(ws, actionId, result);
    },

    submitOrders(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, orders } = params as SubmitOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const updated = client.broker.submitOrder(orders as any);

      if (updated.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.getTimestamp(),
          data: {
            type: "order",
            timestamp: new Date(),
            updated,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { submitted: updated.length });
    },

    amendOrders(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, updates } = params as AmendOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const updated = client.broker.amendOrder(updates as any);

      if (updated.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.getTimestamp(),
          data: {
            type: "order",
            timestamp: new Date(),
            updated,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { amended: updated.length });
    },

    cancelOrders(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid, orderIds } = params as CancelOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const cancelled = client.broker.cancelOrder(orderIds);

      if (cancelled.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.getTimestamp(),
          data: {
            type: "order",
            timestamp: new Date(),
            updated: cancelled,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { cancelled: cancelled.length });
    },

    cancelAllOrders(this: Server, session: Session, ws: WebSocket, actionId: number, params: unknown): void {
      const { cid } = params as CancelAllOrdersParams;

      const client = session.getClient(cid);
      if (!client) {
        this.sendResponse(ws, actionId, undefined, { code: "INVALID_CLIENT", message: "Client not logged in" });
        return;
      }

      const cancelled = client.broker.cancelAllOrders();

      if (cancelled.length > 0) {
        const event: OrderWSEvent = {
          type: "event",
          cid,
          timestamp: this.getTimestamp(),
          data: {
            type: "order",
            timestamp: new Date(),
            updated: cancelled,
            fill: [],
          },
        };
        this.sendEvent(ws, event);
      }

      this.sendResponse(ws, actionId, { cancelled: cancelled.length });
    },
  };

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}

export function createServer(port: number = 8080): Server {
  return new Server(port);
}
