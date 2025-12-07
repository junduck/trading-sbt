import type { Handler } from "./handler.js";
import { cancelOrders } from "../../schema/cancelOrders.schema.js";
import type { OrderEvent } from "../../schema/event.schema.js";
import { serverTime } from "../../shared/utils.js";

export const cancelOrdersHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, sendEvent } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const validated = cancelOrders.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAM", validated.error.message);
    return;
  }

  const ids = cancelOrders.request.decode(validated.data);

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const cancelled = client.broker.cancelOrder(ids);

  if (cancelled.length > 0) {
    const event: OrderEvent = {
      type: "order",
      timestamp: serverTime(),
      updated: cancelled,
      fill: [],
    };
    sendEvent(ws, cid, event);
  }

  sendResponse(ws, id, cid, cancelOrders.response.encode(cancelled.length));
};
