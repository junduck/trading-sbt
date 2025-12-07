import type { Handler } from "./handler.js";
import { unsubscribe } from "../../schema/subscribe.schema.js";

export const unsubscribeHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, activeReplays } =
    context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  if (activeReplays.has(ws)) {
    sendResponse(ws, id, cid, unsubscribe.response.encode([]));
    return;
  }

  const validated = unsubscribe.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAM", validated.error.message);
    return;
  }

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const unsubscribed = client.removeSubscriptions(validated.data);

  sendResponse(ws, id, cid, unsubscribe.response.encode(unsubscribed));
};
