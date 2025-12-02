import { SubscribeParamsSchema } from "../schema/index.js";
import type { SubscribeParams } from "../schema/index.js";
import type { SubscribeResult } from "../protocol.js";
import type { Handler } from "./types.js";

export const subscribeHandler: Handler = (context, params) => {
  const { session, ws, actionId, validateParams, sendResponse, sendError } =
    context;

  const validated = validateParams<SubscribeParams>(
    ws,
    actionId,
    params,
    SubscribeParamsSchema
  );
  if (!validated) return;

  const { cid, symbols } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const subscribed = client.addSubscriptions(symbols);

  const result: SubscribeResult = { subscribed };
  sendResponse(ws, actionId, result);
};
