import { WebSocket } from "ws";

interface Request {
  action: string;
  action_id: number;
  params?: unknown;
}

interface Response {
  type: "response";
  action_id: number;
  result?: unknown;
  error?: { code: string; message: string };
}

interface WSEvent {
  type: "event";
  cid: string;
  timestamp: string;
  data: {
    type: "order" | "market";
    timestamp: string;
    [key: string]: unknown;
  };
}

class TestClient {
  private ws: WebSocket;
  private actionId = 1;
  private pendingRequests = new Map<number, (result: unknown) => void>();

  constructor(private url: string) {
    this.ws = new WebSocket(url);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.ws.on("open", () => {
      console.log("Connected to server");
    });

    this.ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "response") {
        const response = msg as Response;
        const handler = this.pendingRequests.get(response.action_id);
        if (handler) {
          this.pendingRequests.delete(response.action_id);
          if (response.error) {
            console.error(
              `Error [${response.action_id}]:`,
              response.error.code,
              response.error.message
            );
          } else {
            handler(response.result);
          }
        }
      } else if (msg.type === "event") {
        const event = msg as WSEvent;
        this.handleEvent(event);
      }
    });

    this.ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    this.ws.on("close", () => {
      console.log("Disconnected from server");
    });
  }

  private handleEvent(event: WSEvent): void {
    console.log(
      `[Event] cid=${event.cid} type=${event.data.type} timestamp=${event.timestamp}`
    );
    if (event.data.type === "market") {
      const marketData = (event.data as any).marketData;
      console.log(`  Market data: ${marketData?.length || 0} quotes`);
      if (marketData?.length > 0) {
        console.log(`  Sample:`, marketData[0]);
      }
    } else if (event.data.type === "order") {
      const updated = (event.data as any).updated;
      const fill = (event.data as any).fill;
      console.log(
        `  Orders: ${updated?.length || 0} updated, ${fill?.length || 0} filled`
      );
    }
  }

  private send(action: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      const id = this.actionId++;
      this.pendingRequests.set(id, resolve);

      const request: Request = { action, action_id: id, params };
      this.ws.send(JSON.stringify(request));
    });
  }

  async init(): Promise<void> {
    const result = await this.send("init");
    console.log("Init:", result);
  }

  async login(cid: string, config: unknown): Promise<void> {
    const result = await this.send("login", { cid, config });
    console.log(`Login [${cid}]:`, result);
  }

  async subscribe(cid: string, symbols: string[]): Promise<void> {
    const result = await this.send("subscribe", { cid, symbols });
    console.log(`Subscribe [${cid}]:`, result);
  }

  async replay(
    from: string,
    to: string,
    interval: number,
    replay_id: string,
    table: string
  ): Promise<void> {
    const result = await this.send("replay", {
      from,
      to,
      interval,
      replay_id,
      table,
    });
    console.log("Replay finished:", result);
  }

  close(): void {
    this.ws.close();
  }
}

async function main() {
  const client = new TestClient("ws://localhost:8080");

  // Wait for connection
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Initialize
  await client.init();

  // Login two clients
  const config1 = {
    initialCash: 100000,
    commission: {
      rate: 0.0003, // 0.03%
      minimum: 5,
    },
  };

  const config2 = {
    initialCash: 200000,
    commission: {
      rate: 0.0003,
      minimum: 5,
    },
  };

  await client.login("client1", config1);
  await client.login("client2", config2);

  // Subscribe to symbols
  await client.subscribe("client1", ["000001", "600000"]);
  await client.subscribe("client2", ["*"]);

  // Start replay
  console.log("\nStarting replay...\n");
  await client.replay(
    "2025-11-28T14:30:00+08:00",
    "2025-11-28T15:00:00+08:00",
    10, // 10ms interval between batches
    "replay-001",
    "ohlcv_15m"
  );

  console.log("\nReplay completed");

  // Close connection
  client.close();
}

main().catch(console.error);
