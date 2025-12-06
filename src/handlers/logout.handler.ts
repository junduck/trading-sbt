import type { Handler } from "./handler.js";
import { serverTime } from "../utils.js";

export const logoutHandler: Handler = (context, _params) => {
  const { session, ws, id, cid, sendResponse, sendError } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const existed = session.logout(cid);
  if (!existed) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  sendResponse(ws, id, cid, { connected: false, timestamp: serverTime() });
};
