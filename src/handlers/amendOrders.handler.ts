import type { Handler } from "./handler.js";
import { serverTime } from "../utils.js";
import type { OrderEvent } from "../schema/event.schema.js";
import {
  amendOrders,
  type amendOrdersRequestWire,
} from "../schema/amendOrders.schema.js";

export const amendOrdersHandler: Handler = (context, params) => {
  const { session, ws, id, cid, sendResponse, sendError, sendEvent } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const validated = amendOrders.request.validate(
    params as amendOrdersRequestWire
  );
  if (!validated.success) {
    sendError(ws, id, cid, "INVALID_PARAM", validated.error.message);
    return;
  }

  const updates = amendOrders.request.decode(validated.data);

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const updated = client.broker.amendOrder(updates);

  if (updated.length > 0) {
    const event: OrderEvent = {
      type: "order",
      timestamp: serverTime(),
      updated,
      fill: [],
    };
    sendEvent(ws, cid, event);
  }

  sendResponse(ws, id, cid, amendOrders.response.encode(updated.length));
};
