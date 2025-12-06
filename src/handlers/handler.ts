import type { HandlerContext } from "./handler-context.js";

export type Handler = (
  context: HandlerContext,
  params: unknown
) => void | Promise<void>;
