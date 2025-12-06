import { type Handler } from "./handler.js";
import { serverTime } from "../utils.js";
import { login, type LoginResponse } from "../schema/login.schema.js";

export const loginHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, activeReplays } =
    context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const validated = login.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAM", validated.error.message);
    return;
  }

  const { config } = validated.data;

  // Reject login during active replay
  if (activeReplays.has(ws)) {
    sendError(
      ws,
      id,
      cid,
      "REPLAY_ACTIVE",
      "Cannot login during active replay"
    );
    return;
  }

  const now = serverTime();
  session.login(cid, config, now);

  const result: LoginResponse = {
    connected: true,
    timestamp: now,
  };

  sendResponse(ws, id, cid, login.response.encode(result));
};
