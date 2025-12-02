import type { WebSocket } from "ws";
import type { Session } from "../session.js";
import type { WSEvent } from "../protocol.js";

export interface HandlerContext {
  session: Session;
  ws: WebSocket;
  actionId: number;
  dbPath: string | undefined;
  activeReplays: WeakMap<WebSocket, string>;
  sendResponse(ws: WebSocket, actionId: number, result: unknown): void;
  sendError(
    ws: WebSocket,
    actionId: number,
    code: string,
    message: string
  ): void;
  sendEvent(ws: WebSocket, event: WSEvent): void;
  validateParams<T>(
    ws: WebSocket,
    actionId: number,
    params: unknown,
    schema: any
  ): T | undefined;
}

export type Handler = (
  context: HandlerContext,
  params: unknown
) => void | Promise<void>;
