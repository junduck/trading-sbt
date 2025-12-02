import { UnsubscribeParamsSchema } from "../schema/index.js";
import type { UnsubscribeParams } from "../schema/index.js";
import type { UnsubscribeResult } from "../protocol.js";
import type { Handler } from "./types.js";

export const unsubscribeHandler: Handler = (context, params) => {
  const { session, ws, actionId, validateParams, sendResponse, sendError } =
    context;

  const validated = validateParams<UnsubscribeParams>(
    ws,
    actionId,
    params,
    UnsubscribeParamsSchema
  );
  if (!validated) return;

  const { cid, symbols } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const unsubscribed = client.removeSubscriptions(symbols);

  const result: UnsubscribeResult = { unsubscribed };
  sendResponse(ws, actionId, result);
};
