import { createDataSource } from "../datasource/index.js";
import { replay } from "../schema/replay.schema.js";
import type { Handler } from "./handler.js";
import { serverTime } from "../utils.js";
import type { MarketSnapshot } from "@junduck/trading-core";
import type { SbtEvent, MarketEvent } from "../schema/event.schema.js";

export const replayHandler: Handler = async (context, params) => {
  const {
    session,
    ws,
    id,
    dataSourceConfig,
    dataSourcePool,
    replayTables,
    activeReplays,
    sendResponse,
    sendError,
    sendEvent,
    logger,
  } = context;

  const validated = replay.request.validate(params);
  if (!validated.success) {
    sendError(ws, id, undefined, "INVALID_PARAM", validated.error.message);
    return;
  }

  const req = replay.request.decode(validated.data);

  if (activeReplays.has(ws)) {
    sendError(
      ws,
      id,
      undefined,
      "REPLAY_ALREADY_ACTIVE",
      "A replay is already active on this connection"
    );
    return;
  }

  const availableTables = replayTables.map((t) => t.name);
  const table = req.table ?? availableTables[0];
  if (!table) {
    sendError(
      ws,
      id,
      undefined,
      "NO_REPLAY_TABLE",
      "No replay tables configured"
    );
    return;
  }
  if (!availableTables.includes(table)) {
    sendError(
      ws,
      id,
      undefined,
      "INVALID_TABLE",
      `Table '${table}' is not available. Available tables: ${availableTables.join(
        ", "
      )}`
    );
    return;
  }

  const periodicReport = req.periodicReport ?? 0;
  const tradeReport = req.tradeReport ?? false;
  const endOfDayReport = req.endOfDayReport ?? false;
  for (const client of session.clients.values()) {
    client.setReport(periodicReport, tradeReport, endOfDayReport);
  }

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
  const symbols = hasWildcard ? [] : Array.from(allSymbols);

  const fromDate = req.from;
  const toDate = req.to;
  const replayBegin = serverTime();

  activeReplays.set(ws, req.replayId);

  let replayDb;
  try {
    replayDb = await createDataSource(
      req.replayId,
      dataSourceConfig,
      dataSourcePool,
      table,
      symbols
    );
  } catch (error) {
    activeReplays.delete(ws);
    sendError(
      ws,
      id,
      undefined,
      "DATA_SOURCE_ERROR",
      error instanceof Error ? error.message : "Failed to create data source"
    );
    return;
  }

  const multiplex = req.marketMultiplex ?? false;

  try {
    const snapshot: MarketSnapshot = {
      price: new Map(),
      timestamp: new Date(0),
    };

    for await (const batch of replayDb.replayData(fromDate, toDate)) {
      const { timestamp, data } = batch;
      const replayTime = timestamp;

      for (const [_clientId, client] of session.clients.entries()) {
        client.setTime(replayTime);
      }

      for (const item of data) {
        snapshot.price.set(item.symbol, item.price);
      }
      snapshot.timestamp = replayTime;

      for (const [clientId, client] of session.clients.entries()) {
        const openSymbols = client.broker.getOpenSymbols();
        if (openSymbols.size > 0) {
          const clientData = data.filter((quote) =>
            openSymbols.has(quote.symbol)
          );
          if (clientData.length > 0) {
            const events = client.processOrderUpdate(clientData, snapshot);
            for (const event of events) {
              sendEvent(ws, clientId, event);
            }
          }
        }
      }

      for (const [clientId, client] of session.clients.entries()) {
        const clientData = client.subscriptions.has("*")
          ? data
          : data.filter((quote) => client.subscriptions.has(quote.symbol));

        if (clientData.length > 0) {
          const events: SbtEvent[] = client.processMarketData(
            clientData,
            snapshot
          );
          for (const event of events) {
            sendEvent(ws, clientId, event);
          }
        }

        if (!multiplex) {
          const market: MarketEvent = {
            type: "market",
            timestamp: replayTime,
            marketData: clientData,
          };
          sendEvent(ws, clientId, market);
        }
      }

      if (multiplex) {
        // ochestrator de-multiplexes market data to clients, send single market event
        const market: MarketEvent = {
          type: "market",
          timestamp: replayTime,
          marketData: data,
        };
        sendEvent(ws, "__multiplex__", market);
      }

      await new Promise((resolve) => setTimeout(resolve, req.replayInterval));
    }

    const replayEnd = serverTime();

    sendResponse(
      ws,
      id,
      undefined,
      replay.response.encode({
        replayId: req.replayId,
        begin: replayBegin,
        end: replayEnd,
      })
    );
  } catch (error) {
    logger.error({ err: error }, "Replay error");
    sendError(
      ws,
      id,
      undefined,
      "REPLAY_ERROR",
      error instanceof Error ? error.message : "Unknown replay error"
    );
  } finally {
    await replayDb?.close();
    activeReplays.delete(ws);
  }
};
