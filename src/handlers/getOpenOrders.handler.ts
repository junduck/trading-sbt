import { GetOpenOrdersParamsSchema } from "../schema/index.js";
import type { GetOpenOrdersParams } from "../schema/index.js";
import type { GetOpenOrdersResult } from "../protocol.js";
import type { Handler } from "./types.js";

export const getOpenOrdersHandler: Handler = (context, params) => {
  const { session, ws, actionId, validateParams, sendResponse, sendError } =
    context;

  const validated = validateParams<GetOpenOrdersParams>(
    ws,
    actionId,
    params,
    GetOpenOrdersParamsSchema
  );
  if (!validated) return;

  const { cid } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const result: GetOpenOrdersResult = client.broker.getOpenOrders();
  sendResponse(ws, actionId, result);
};
