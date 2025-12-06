import type { WebSocket } from "ws";
import type { Logger } from "pino";
import type { Session } from "../session.js";
import type { DataSourceConfig } from "../schema/data-source.schema.js";
import type { DataSourcePool } from "../datasource/index.js";
import type { TableInfo } from "../types.js";
import type { SbtEvent } from "../schema/event.schema.js";

export interface HandlerContext {
  session: Session;
  ws: WebSocket;

  id: number;
  cid: string | undefined;

  dataSourceConfig: DataSourceConfig;
  dataSourcePool: DataSourcePool;

  replayTables: TableInfo[];
  activeReplays: WeakMap<WebSocket, string>;

  logger: Logger;

  sendResponse(
    ws: WebSocket,
    id: number,
    cid: string | undefined,
    result: unknown
  ): void;
  sendEvent(ws: WebSocket, cid: string, event: SbtEvent): void;
  sendError(
    ws: WebSocket,
    id: number,
    cid: string | undefined,
    code: string,
    message: string
  ): void;
}
