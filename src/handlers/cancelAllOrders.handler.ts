import { CancelAllOrdersParamsSchema } from "../schema/index.js";
import type { CancelAllOrdersParams } from "../schema/index.js";
import type { OrderWSEvent } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const cancelAllOrdersHandler: Handler = (context, params) => {
  const {
    session,
    ws,
    actionId,
    validateParams,
    sendResponse,
    sendError,
    sendEvent,
  } = context;

  const validated = validateParams<CancelAllOrdersParams>(
    ws,
    actionId,
    params,
    CancelAllOrdersParamsSchema
  );
  if (!validated) return;

  const { cid } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const cancelled = client.broker.cancelAllOrders();

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
