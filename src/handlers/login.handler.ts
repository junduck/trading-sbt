import { LoginParamsSchema } from "../schema/index.js";
import type { LoginParams } from "../schema/index.js";
import type { LoginResult } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const loginHandler: Handler = (context, params) => {
  const {
    session,
    ws,
    actionId,
    activeReplays,
    validateParams,
    sendResponse,
    sendError,
  } = context;

  const validated = validateParams<LoginParams>(
    ws,
    actionId,
    params,
    LoginParamsSchema
  );
  if (!validated) return;

  const { cid, config } = validated;

  // Reject login during active replay
  if (activeReplays.has(ws)) {
    sendError(
      ws,
      actionId,
      "REPLAY_ACTIVE",
      "Cannot login during active replay"
    );
    return;
  }

  session.login(cid, config, serverTime());

  const result: LoginResult = {
    connected: true,
    timestamp: serverTime(),
  };

  sendResponse(ws, actionId, result);
};
