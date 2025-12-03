import type { Handler } from "./types.js";

export const initHandler: Handler = (context, _params) => {
  const { ws, actionId, sendResponse, replayTables } = context;

  sendResponse(ws, actionId, {
    version: "1.0.0",
    replay_tables: replayTables,
  });
};
