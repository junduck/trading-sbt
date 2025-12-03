import { createDataSource } from "../datasource/index.js";
import { ReplayParamsSchema } from "../schema/index.js";
import type { ReplayParams } from "../schema/index.js";
import type { ReplayResult, OrderWSEvent, MarketWSEvent } from "../protocol.js";
import type { Handler } from "./types.js";
import { serverTime } from "../utils.js";

export const replayHandler: Handler = async (context, params) => {
  const {
    session,
    ws,
    actionId,
    dataSourceConfig,
    dataSourcePool,
    replayTables,
    activeReplays,
    validateParams,
    sendResponse,
    sendError,
    sendEvent,
  } = context;

  const validated = validateParams<ReplayParams>(
    ws,
    actionId,
    params,
    ReplayParamsSchema
  );
  if (!validated) return;

  const { from, to, interval, replay_id, table } = validated;

  // Reject if there's already an active replay on this connection
  if (activeReplays.has(ws)) {
    sendError(
      ws,
      actionId,
      "REPLAY_ALREADY_ACTIVE",
      "A replay is already active on this connection"
    );
    return;
  }

  // Check table is in enabled replay tables
  if (!replayTables.includes(table)) {
    sendError(
      ws,
      actionId,
      "INVALID_TABLE",
      `Table '${table}' is not available. Available tables: ${replayTables.join(
        ", "
      )}`
    );
    return;
  }

  // Collect all subscribed symbols from all clients on this connection
  const allSymbols = new Set<string>();
  let hasWildcard = false;

  for (const client of session.clients.values()) {
    if (client.subscriptions.has("*")) {
      hasWildcard = true;
      break;
    }
    for (const symbol of client.subscriptions) {
      allSymbols.add(symbol);
    }
  }

  // If wildcard, query all symbols; otherwise filter by specific symbols
  const symbols = hasWildcard ? [] : Array.from(allSymbols);

  // Convert ISO datetime strings to Date objects
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const replayBegin = serverTime();

  // Mark replay as active
  activeReplays.set(ws, replay_id);

  // Create data source instance for this replay with symbol filter and table
  let replayDb;
  try {
    replayDb = await createDataSource(
      replay_id,
      dataSourceConfig,
      dataSourcePool,
      table,
      symbols
    );
  } catch (error) {
    activeReplays.delete(ws);
    sendError(
      ws,
      actionId,
      "DATA_SOURCE_ERROR",
      error instanceof Error ? error.message : "Failed to create data source"
    );
    return;
  }

  try {
    // Stream data using async generator
    // Order guarantee: for await ensures sequential batch processing,
    // sendEvent calls are synchronous FIFO writes, interval provides backpressure
    for await (const batch of replayDb.replayData(fromDate, toDate)) {
      const { timestamp, data } = batch;
      const replayTime = timestamp;

      // Update broker time for all clients
      for (const client of session.clients.values()) {
        client.setTime(replayTime);
      }

      // Step 1: Process pending orders for all clients and send order events
      for (const client of session.clients.values()) {
        const openSymbols = client.broker.getOpenSymbols();

        // Only process market data for symbols with open orders
        if (openSymbols.size > 0) {
          const clientData = data.filter((quote) =>
            openSymbols.has(quote.symbol)
          );

          if (clientData.length > 0) {
            // Process pending orders with market data
            const { updated, filled } =
              client.broker.processPendingOrders(clientData);

            // Send order event if there are updates
            if (updated.length > 0) {
              const event: OrderWSEvent = {
                type: "event",
                cid: client.cid,
                timestamp: serverTime(),
                data: {
                  type: "order",
                  timestamp: serverTime(),
                  updated,
                  fill: filled,
                },
              };
              sendEvent(ws, event);
            }
          }
        }
      }

      // Step 2: Send market data to subscribed clients
      for (const client of session.clients.values()) {
        // Filter quotes for this client's subscriptions
        const clientData = client.subscriptions.has("*")
          ? data
          : data.filter((quote) => client.subscriptions.has(quote.symbol));

        if (clientData.length > 0) {
          const event: MarketWSEvent = {
            type: "event",
            cid: client.cid,
            timestamp: serverTime(),
            data: {
              type: "market",
              timestamp: serverTime(),
              marketData: clientData,
            },
          };
          sendEvent(ws, event);
        }
      }

      // Backpressure control
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    const replayEnd = serverTime();

    // Send completion response
    const result: ReplayResult = {
      replay_finished: replay_id,
      begin: replayBegin,
      end: replayEnd,
    };

    sendResponse(ws, actionId, result);
  } catch (error) {
    // Send error response to client
    sendError(
      ws,
      actionId,
      "REPLAY_ERROR",
      error instanceof Error ? error.message : "Unknown replay error"
    );
  } finally {
    // Clean up
    await replayDb.close();
    activeReplays.delete(ws);
  }
};
