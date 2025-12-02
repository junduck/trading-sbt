import { InitParamsSchema } from "../schema/index.js";
import type { Handler } from "./types.js";

export const initHandler: Handler = (context, params) => {
  const { ws, actionId, validateParams, sendResponse, replayTables } = context;

  const validated = validateParams(ws, actionId, params, InitParamsSchema);
  if (validated === undefined && params !== undefined) return;

  sendResponse(ws, actionId, {
    version: "1.0.0",
    replay_tables: replayTables,
  });
};
