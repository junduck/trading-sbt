import { WebSocket } from "ws";
import { Orchestrator, type SbtEvent } from "../src/index.js";
import { buyOrder, type Order } from "@junduck/trading-core";

async function main() {
  const orchestrator = new Orchestrator("ws://localhost:8080", WebSocket);

  await orchestrator.waitForConnection();
  console.log("Connected to server");

  const initInfo = await orchestrator.init();
  console.log("Server info:", initInfo);

  const { tables } = initInfo;
  if (!tables || tables.length === 0) {
    console.error("No available tables from server");
    orchestrator.close();
    return;
  }

  const tableInfo = tables[0];
  const table = tableInfo.name;
  const startTime = tableInfo.startTime;
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  // Login client with event handler
  const client1 = await orchestrator.login(
    {
      initialCash: 100000,
      commission: {
        rate: 0.0003,
        minimum: 5,
      },
    },
    async (event: SbtEvent) => {
      console.log(`[strategy-alpha] Event: ${event.type}`);

      if (event.type === "market") {
        console.log(`  Market quotes: ${event.data.length}`);

        // Example: Simple strategy - buy when we see quotes
        if (event.data.length > 0) {
          const quote = event.data[0];
          if (quote.ask && quote.askVol! > 0) {
            try {
              const order = buyOrder({
                symbol: quote.symbol,
                quant: 100,
                price: quote.ask,
              });
              const submitted = await client1.submitOrders([order]);
              console.log(`  Submitted ${submitted} order(s)`);
            } catch (err) {
              console.error("  Failed to submit order:", err);
            }
          }
        }
      } else if (event.type === "order") {
        console.log(
          `  Order updates: ${event.updated.length}, fills: ${event.fill.length}`
        );

        for (const fill of event.fill) {
          console.log(
            `  Fill: ${fill.symbol} ${fill.side} ${fill.quantity}@${fill.price}`
          );
        }
      } else if (event.type === "metrics") {
        console.log(`  Metrics: EQUITY=${(event.report as any)["equity"]}`);
      }
    }
  );

  console.log(`Logged in as ${client1.cid}`);

  // Subscribe to symbols
  await client1.subscribe(["000001", "600000"]);
  console.log("Subscribed to symbols");

  // Create second client with different strategy
  const client2 = await orchestrator.login(
    {
      initialCash: 200000,
      commission: {
        rate: 0.0003,
        minimum: 5,
      },
    },
    async (event: SbtEvent) => {
      console.log(`[strategy-beta] Event: ${event.type}`);

      if (event.type === "order") {
        const position = await client2.getPosition();
        console.log(`  Current position:`, position);
      }
    }
  );

  await client2.subscribe(["*"]);
  console.log(`Logged in as ${client2.cid}`);

  // Start replay
  console.log(
    `\nStarting replay for table '${table}' from ${startTime.toISOString()} to ${endTime.toISOString()}\n`
  );

  const replayResult = await orchestrator.replay({
    table,
    startTime,
    endTime,
    replayId: "replay-001",
    replayInterval: 10,
  });

  console.log("\nReplay finished:", replayResult);

  // Check final states
  const finalPosition1 = await client1.getPosition();
  const finalOrders1 = await client1.getOpenOrders();

  console.log(`\n[${client1.cid}] Final position:`, finalPosition1);
  console.log(`[${client1.cid}] Open orders: ${finalOrders1.length}`);

  const finalPosition2 = await client2.getPosition();
  const finalOrders2 = await client2.getOpenOrders();

  console.log(`\n[${client2.cid}] Final position:`, finalPosition2);
  console.log(`[${client2.cid}] Open orders: ${finalOrders2.length}`);

  // Logout
  await orchestrator.logout(client1.cid);
  await orchestrator.logout(client2.cid);

  orchestrator.close();
}

main().catch(console.error);
