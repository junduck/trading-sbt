import { AmendOrdersParamsSchema } from "../schema/index.js";
import type { AmendOrdersParams } from "../schema/index.js";
import type { OrderWSEvent } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const amendOrdersHandler: Handler = (context, params) => {
  const {
    session,
    ws,
    actionId,
    validateParams,
    sendResponse,
    sendError,
    sendEvent,
  } = context;

  const validated = validateParams<AmendOrdersParams>(
    ws,
    actionId,
    params,
    AmendOrdersParamsSchema
  );
  if (!validated) return;

  const { cid, updates } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const updated = client.broker.amendOrder(updates as any); // TODO: validate order update

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

  sendResponse(ws, actionId, { amended: updated.length });
};
