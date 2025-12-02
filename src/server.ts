import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import type { Request, Response, WSEvent } from "./protocol.js";
import { DataSourceSchema, type DataSourceConfig } from "./schema/data-source.schema.js";
import { logger } from "./logger.js";
import {
  initHandler,
  loginHandler,
  logoutHandler,
  subscribeHandler,
  unsubscribeHandler,
  getPositionHandler,
  getOpenOrdersHandler,
  submitOrdersHandler,
  amendOrdersHandler,
  cancelOrdersHandler,
  cancelAllOrdersHandler,
  replayHandler,
  type Handler,
  type HandlerContext,
} from "./handlers/index.js";

export class Server {
  private readonly wss: WebSocketServer;
  private readonly connectionSessions = new WeakMap<WebSocket, Session>();
  private readonly activeReplays = new WeakMap<WebSocket, string>();
  private readonly dataSourceConfig: DataSourceConfig;

  constructor(port: number = 8080, dataSourceConfig: DataSourceConfig) {
    // Validate data source config
    const validated = DataSourceSchema.safeParse(dataSourceConfig);
    if (!validated.success) {
      throw new Error(
        `Invalid data source configuration: ${validated.error.message}`
      );
    }

    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    this.dataSourceConfig = validated.data;
    logger.info({ port, dataSource: validated.data.type }, "WebSocket server started");
  }

  private handleConnection(ws: WebSocket): void {
    const session = new Session();
    this.connectionSessions.set(ws, session);

    logger.info("Client connected");

    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, session, data.toString());
    });

    ws.on("close", () => {
      logger.info("Client disconnected");
      session.cleanup();
    });

    ws.on("error", (error) => {
      logger.error({ err: error }, "WebSocket error");
    });
  }

  private handleMessage(ws: WebSocket, session: Session, data: string): void {
    try {
      const request: Request = JSON.parse(data);
      const { action, action_id, params } = request;

      const handler = this.handlers[action as keyof typeof this.handlers];
      if (!handler) {
        this.sendError(ws, action_id, "INVALID_ACTION", `Unknown action: ${action}`);
        return;
      }

      const context: HandlerContext = {
        session,
        ws,
        actionId: action_id,
        dataSourceConfig: this.dataSourceConfig,
        activeReplays: this.activeReplays,
        sendResponse: this.sendResponse.bind(this),
        sendError: this.sendError.bind(this),
        sendEvent: this.sendEvent.bind(this),
        validateParams: this.validateParams.bind(this),
      };

      handler(context, params);
    } catch (error) {
      logger.error({ err: error }, "Error handling message");
    }
  }

  private sendResponse(
    ws: WebSocket,
    actionId: number,
    result: unknown
  ): void {
    const response: Response = { type: "response", action_id: actionId, result };
    ws.send(JSON.stringify(response));
  }

  private sendError(
    ws: WebSocket,
    actionId: number,
    code: string,
    message: string
  ): void {
    logger.error({ actionId, code, message }, "Error response sent to client");
    const response: Response = {
      type: "response",
      action_id: actionId,
      error: { code, message },
    };
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
      const errorMessage =
        result.error.errors
          ?.map((e: any) => `${e.path.join(".")}: ${e.message}`)
          .join(", ") ||
        result.error.message ||
        "Invalid parameters";

      this.sendError(ws, actionId, "INVALID_PARAMS", errorMessage);
      return undefined;
    }
    return result.data;
  }

  private handlers: Record<string, Handler> = {
    init: initHandler,
    login: loginHandler,
    logout: logoutHandler,

    subscribe: subscribeHandler,
    unsubscribe: unsubscribeHandler,

    getPosition: getPositionHandler,
    getOpenOrders: getOpenOrdersHandler,

    submitOrders: submitOrdersHandler,
    amendOrders: amendOrdersHandler,
    cancelOrders: cancelOrdersHandler,
    cancelAllOrders: cancelAllOrdersHandler,

    replay: replayHandler,
  };

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        resolve();
      });
    });
  }
}

export function createServer(port: number = 8080, dataSourceConfig: DataSourceConfig): Server {
  return new Server(port, dataSourceConfig);
}
