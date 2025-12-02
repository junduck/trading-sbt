import { CancelOrdersParamsSchema } from "../schema/index.js";
import type { CancelOrdersParams } from "../schema/index.js";
import type { OrderWSEvent } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const cancelOrdersHandler: Handler = (context, params) => {
  const {
    session,
    ws,
    actionId,
    validateParams,
    sendResponse,
    sendError,
    sendEvent,
  } = context;

  const validated = validateParams<CancelOrdersParams>(
    ws,
    actionId,
    params,
    CancelOrdersParamsSchema
  );
  if (!validated) return;

  const { cid, orderIds } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const cancelled = client.broker.cancelOrder(orderIds);

  if (cancelled.length > 0) {
    const event: OrderWSEvent = {
      type: "event",
      cid,
      timestamp: serverTime(),
      data: {
        type: "order",
        timestamp: serverTime(),
        updated: cancelled,
        fill: [],
      },
    };
    sendEvent(ws, event);
  }

  sendResponse(ws, actionId, { cancelled: cancelled.length });
};
