import type { Handler } from "./handler.js";
import { getOpenOrders } from "../schema/getOpenOrders.schema.js";

export const getOpenOrdersHandler: Handler = (context, _params) => {
  const { session, ws, id, cid, sendResponse, sendError } = context;

  if (!cid) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client id is required");
    return;
  }

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, id, cid, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const orders = client.broker.getOpenOrders();
  sendResponse(ws, id, cid, getOpenOrders.response.encode(orders));
};
