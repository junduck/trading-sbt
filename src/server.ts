import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import type { Request, Response, WSEvent } from "./protocol.js";
import {
  DataSourceSchema,
  type DataSourceConfig,
} from "./schema/data-source.schema.js";
import {
  initializePool,
  closePool,
  createDataSource,
  type DataSourcePool,
} from "./datasource/index.js";
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
  private readonly dataSourcePool: DataSourcePool;
  private readonly replayTables: string[];

  constructor(
    port: number,
    dataSourceConfig: DataSourceConfig,
    dataSourcePool: DataSourcePool,
    replayTables: string[]
  ) {
    this.dataSourceConfig = dataSourceConfig;
    this.dataSourcePool = dataSourcePool;
    this.replayTables = replayTables;

    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    logger.info(
      { port, dataSource: dataSourceConfig.type, replayTables },
      "WebSocket server started"
    );
  }

  private handleConnection(ws: WebSocket): void {
    const session = new Session();
    this.connectionSessions.set(ws, session);

    logger.info("Client connected");

    // Fire-and-forget message handling is safe here because:
    // - Long-running operations (replay) have concurrency protection (activeReplays)
    // - Sequential processing within handlers is guaranteed by await chains
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

  private async handleMessage(
    ws: WebSocket,
    session: Session,
    data: string
  ): Promise<void> {
    let action_id: number | undefined;
    try {
      const request: Request = JSON.parse(data);
      action_id = request.action_id;
      const { action, params } = request;

      const handler = this.handlers[action as keyof typeof this.handlers];
      if (!handler) {
        this.sendError(
          ws,
          action_id,
          "INVALID_ACTION",
          `Unknown action: ${action}`
        );
        return;
      }

      const context: HandlerContext = {
        session,
        ws,
        actionId: action_id,
        dataSourceConfig: this.dataSourceConfig,
        dataSourcePool: this.dataSourcePool,
        replayTables: this.replayTables,
        activeReplays: this.activeReplays,
        sendResponse: this.sendResponse.bind(this),
        sendError: this.sendError.bind(this),
        sendEvent: this.sendEvent.bind(this),
        validateParams: this.validateParams.bind(this),
      };

      await handler(context, params);
    } catch (error) {
      logger.error({ err: error }, "Error handling message");
      // Send error response if we have action_id (parse succeeded)
      if (action_id !== undefined) {
        this.sendError(
          ws,
          action_id,
          "INTERNAL_ERROR",
          error instanceof Error ? error.message : "Internal server error"
        );
      }
    }
  }

  private sendResponse(ws: WebSocket, actionId: number, result: unknown): void {
    const response: Response = {
      type: "response",
      action_id: actionId,
      result,
    };
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

  async close(): Promise<void> {
    // Close WebSocket server
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          logger.error({ err }, "Error closing WebSocket server");
          reject(err);
        } else {
          logger.info("WebSocket server closed");
          resolve();
        }
      });
    });

    // Close database connection pool
    try {
      await closePool(this.dataSourcePool);
      logger.info("Database connection pool closed");
    } catch (error) {
      logger.error({ err: error }, "Error closing database pool");
      throw error;
    }

    logger.info("Server closed");
  }
}

export async function createServer(
  port: number = 8080,
  dataSourceConfig: DataSourceConfig
): Promise<Server> {
  // Validate data source config
  const validated = DataSourceSchema.safeParse(dataSourceConfig);
  if (!validated.success) {
    throw new Error(
      `Invalid data source configuration: ${validated.error.message}`
    );
  }

  // Initialize pool and get available tables
  const pool = initializePool(validated.data);
  const tempDataSource = await createDataSource(validated.data, pool);
  const availTables = await tempDataSource.availTables();
  await tempDataSource.close();

  // Only filter tables for datasources that support replay config
  if (
    validated.data.type === "sqlite" ||
    validated.data.type === "postgres" ||
    validated.data.type === "mysql"
  ) {
    if (availTables.length === 0) {
      throw new Error("No tables found in data source");
    }

    // Filter tables based on replay config
    let replayTables: string[];
    const configuredTables = validated.data.replay;

    if (configuredTables && configuredTables.length > 0) {
      replayTables = availTables.filter((table) =>
        configuredTables.includes(table)
      );

      if (replayTables.length === 0) {
        throw new Error(
          `None of the configured replay tables exist. Available: ${availTables.join(", ")}`
        );
      }

      const missingTables = configuredTables.filter(
        (table) => !availTables.includes(table)
      );
      if (missingTables.length > 0) {
        logger.warn(
          { missingTables, availTables },
          "Some configured replay tables not found in data source"
        );
      }
    } else {
      replayTables = availTables;
    }

    logger.info({ replayTables }, "Available replay tables");

    return new Server(port, validated.data, pool, replayTables);
  }

  // For CSV and JSON, implement later
  throw new Error(`Data source type '${validated.data.type}' not fully implemented yet`);
}
