import { GetPositionParamsSchema } from "../schema/index.js";
import type { GetPositionParams } from "../schema/index.js";
import type { GetPositionResult } from "../protocol.js";
import type { Handler } from "./types.js";

export const getPositionHandler: Handler = (context, params) => {
  const { session, ws, actionId, validateParams, sendResponse, sendError } =
    context;

  const validated = validateParams<GetPositionParams>(
    ws,
    actionId,
    params,
    GetPositionParamsSchema
  );
  if (!validated) return;

  const { cid } = validated;

  const client = session.getClient(cid);
  if (!client) {
    sendError(ws, actionId, "INVALID_CLIENT", "Client not logged in");
    return;
  }

  const result: GetPositionResult = client.broker.getPosition();
  sendResponse(ws, actionId, result);
};
