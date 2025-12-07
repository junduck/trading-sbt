import type { Handler } from "./handler.js";
import { cancelAllOrders } from "../../schema/cancelOrders.schema.js";
import type { OrderEvent } from "../../schema/event.schema.js";
import { serverTime } from "../../shared/utils.js";

export const cancelAllOrdersHandler: Handler = (context, _params) => {
  const { session, ws, id, cid, sendResponse, sendError, sendEvent } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const cancelled = client.broker.cancelAllOrders();

  if (cancelled.length > 0) {
    const event: OrderEvent = {
      type: "order",
      timestamp: serverTime(),
      updated: cancelled,
      fill: [],
    };
    sendEvent(ws, cid, event);
  }

  sendResponse(ws, id, cid, cancelAllOrders.response.encode(cancelled.length));
};
