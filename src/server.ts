import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session.js";
import {
  DataSourceSchema,
  type DataSourceConfig,
} from "./schema/data-source.schema.js";
import {
  initializePool,
  closePool,
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
} from "./handlers/index.js";
import { getTableInfo } from "./utils.js";

import {
  RequestWireSchema,
  type RequestWire,
  type ResponseWire,
} from "./schema/protocol.schema.js";
import {
  externalEvent,
  marketEvent,
  metricsEvent,
  orderEvent,
  type ExternalEvent,
  type MarketEvent,
  type MetricsEvent,
  type OrderEvent,
} from "./schema/event.schema.js";
import type { HandlerContext } from "./handlers/handler-context.js";
import type { Handler } from "./handlers/handler.js";
import z from "zod";
import type { TableInfo } from "./types.js";
import type { Event } from "./schema/event.schema.js";

export class Server {
  private readonly wss: WebSocketServer;
  private readonly connectionSessions = new WeakMap<WebSocket, Session>();
  private readonly activeReplays = new WeakMap<WebSocket, string>();
  private readonly dataSourceConfig: DataSourceConfig;
  private readonly dataSourcePool: DataSourcePool;
  private readonly replayTables: TableInfo[];

  constructor(
    port: number,
    dataSourceConfig: DataSourceConfig,
    dataSourcePool: DataSourcePool,
    replayTables: TableInfo[]
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
    try {
      const req = this.validateWire(
        ws,
        undefined,
        undefined,
        JSON.parse(data),
        RequestWireSchema
      ) as RequestWire;
      if (req === undefined) {
        return;
      }

      const { method, id, cid, params } = req;

      const handler = this.handlers[method as keyof typeof this.handlers];
      if (!handler) {
        this.sendError(
          ws,
          id,
          cid,
          "INVALID_METHOD",
          `Unknown method: ${method}`
        );
        return;
      }

      const context: HandlerContext = {
        session,
        ws,
        id,
        cid,
        dataSourceConfig: this.dataSourceConfig,
        dataSourcePool: this.dataSourcePool,
        replayTables: this.replayTables,
        activeReplays: this.activeReplays,
        logger,
        sendResponse: this.sendResponse.bind(this),
        sendError: this.sendError.bind(this),
        sendEvent: this.sendEvent.bind(this),
      };

      await handler(context, params);
    } catch (error) {
      // Handler should have their own try block, this catch should not happen at all
      logger.error({ err: error }, "Error handling message");
      this.sendError(
        ws,
        undefined,
        undefined,
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Internal server error"
      );
    }
  }

  private sendResponse(
    ws: WebSocket,
    id: number,
    cid: string | undefined,
    result: unknown
  ): void {
    const response: ResponseWire = {
      type: "result",
      id,
      cid,
      result,
    };
    ws.send(JSON.stringify(response));
  }

  sendEvent(ws: WebSocket, cid: string, event: Event): void {
    let serialise: any;
    switch (event.type) {
      case "market":
        serialise = marketEvent.encode(event as MarketEvent);
        break;
      case "order":
        serialise = orderEvent.encode(event as OrderEvent);
        break;
      case "metrics":
        serialise = metricsEvent.encode(event as MetricsEvent);
        break;
      case "external":
        serialise = externalEvent.encode(event as ExternalEvent);
    }
    const response: ResponseWire = {
      type: "event",
      cid: cid,
      event: serialise,
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(
    ws: WebSocket,
    id: number | undefined,
    cid: string | undefined,
    code: string,
    message: string
  ): void {
    logger.error({ cid, id, code, message }, "Error response sent to client");
    const response: ResponseWire = {
      type: "error",
      error: { code, message },
    };
    if (id !== undefined) response.id = id;
    if (cid !== undefined) response.cid = cid;
    ws.send(JSON.stringify(response));
  }

  private validateWire(
    ws: WebSocket,
    id: number | undefined,
    cid: string | undefined,
    params: unknown,
    schema: any
  ): any | undefined {
    const result = schema.safeParse(params);
    if (!result.success) {
      this.sendError(
        ws,
        id,
        cid,
        "INVALID_PARAMS",
        z.prettifyError(result.error)
      );
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
  const tables = await getTableInfo(validated.data, pool);

  // Only filter tables for datasources that support replay config
  if (
    validated.data.type === "sqlite" ||
    validated.data.type === "postgres" ||
    validated.data.type === "mysql"
  ) {
    if (tables.length === 0) {
      throw new Error("No tables found in data source");
    }

    // Filter tables based on replay config
    let replayTables: TableInfo[];
    const configuredTables = validated.data.replay;

    if (configuredTables && configuredTables.length > 0) {
      replayTables = tables.filter((table) =>
        configuredTables.includes(table.name)
      );

      if (replayTables.length === 0) {
        throw new Error(
          `None of the configured replay tables exist. Available: ${tables.join(
            ", "
          )}`
        );
      }

      const missingTables = configuredTables.filter(
        (table) => !tables.some((t) => t.name === table)
      );
      if (missingTables.length > 0) {
        logger.warn(
          { missingTables, tables },
          "Some configured replay tables not found in data source"
        );
      }
    } else {
      replayTables = tables;
    }

    logger.info({ replayTables }, "Available replay tables");

    return new Server(port, validated.data, pool, replayTables);
  }

  // For CSV and JSON, implement later
  throw new Error(
    `Data source type '${validated.data.type}' not fully implemented yet`
  );
}
