import type { Handler } from "./handler.js";
import { submitOrders } from "../../schema/submitOrders.schema.js";
import type { OrderEvent } from "../../schema/event.schema.js";
import { serverTime } from "../../shared/utils.js";

export const submitOrdersHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, sendEvent } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const validated = submitOrders.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAM", validated.error.message);
    return;
  }

  const orders = submitOrders.request.decode(validated.data);
  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const updated = client.broker.submitOrder(orders);

  if (updated.length > 0) {
    const event: OrderEvent = {
      type: "order",
      timestamp: serverTime(),
      updated,
      fill: [],
    };
    sendEvent(ws, cid, event);
  }

  sendResponse(ws, id, cid, submitOrders.response.encode(updated.length));
};
