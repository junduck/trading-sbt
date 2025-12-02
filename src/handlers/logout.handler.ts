import { LogoutParamsSchema } from "../schema/index.js";
import type { LogoutParams } from "../schema/index.js";
import type { Handler } from "./types.js";

export const logoutHandler: Handler = (context, params) => {
  const { session, ws, actionId, validateParams, sendResponse } = context;

  const validated = validateParams<LogoutParams>(
    ws,
    actionId,
    params,
    LogoutParamsSchema
  );
  if (!validated) return;

  const { cid } = validated;

  session.logout(cid);

  sendResponse(ws, actionId, { connected: false });
};
