import { SubmitOrdersParamsSchema } from "../schema/index.js";
import type { SubmitOrdersParams } from "../schema/index.js";
import type { OrderWSEvent } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const submitOrdersHandler: Handler = (context, params) => {
  const {
    session,
    ws,
    actionId,
    validateParams,
    sendResponse,
    sendError,
    sendEvent,
  } = context;

  const validated = validateParams<SubmitOrdersParams>(
    ws,
    actionId,
    params,
    SubmitOrdersParamsSchema
  );
  if (!validated) return;

  const { cid, orders } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const updated = client.broker.submitOrder(orders as any);

  if (updated.length > 0) {
    const event: OrderWSEvent = {
      type: "event",
      cid,
      timestamp: serverTime(),
      data: {
        type: "order",
        timestamp: serverTime(),
        updated,
        fill: [],
      },
    };
    sendEvent(ws, event);
  }

  sendResponse(ws, actionId, { submitted: updated.length });
};
