import { init } from "../../schema/init.schema.js";
import type { Handler } from "./handler.js";

export const initHandler: Handler = (context, _params) => {
  const { ws, id, sendResponse, replayTables } = context;

  sendResponse(
    ws,
    id,
    undefined,
    init.response.encode({
      replayTables: replayTables,
    })
  );
};
