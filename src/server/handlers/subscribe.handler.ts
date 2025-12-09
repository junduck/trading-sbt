import type { Handler } from "./handler.js";
import { subscribe } from "../../schema/subscribe.schema.js";

export const subscribeHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, activeReplays } =
    context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  if (activeReplays.has(ws)) {
    sendResponse(ws, id, cid, subscribe.response.encode([]));
    return;
  }

  const validated = subscribe.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAMS", validated.error.message);
    return;
  }

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const subscribed = client.addSubscriptions(validated.data);

  sendResponse(ws, id, cid, subscribe.response.encode(subscribed));
};
