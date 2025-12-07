import { WebSocket } from "ws";
import {
  type RequestWire,
  type ResponseWire,
  init,
  login,
  type LoginRequest,
  subscribe,
  type SubscribeRequest,
  replay,
  type ReplayRequest,
  marketEvent,
  orderEvent,
  metricsEvent,
  type InitReponse,
  type LoginResponse,
  type SubscribeResponse,
  type ReplayResponse,
} from "../src/schema/index.js";

class TestClient {
  private ws: WebSocket;
  private actionId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(private url: string) {
    this.ws = new WebSocket(url);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.ws.on("open", () => {
      console.log("Connected to server");
    });

    this.ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as ResponseWire;

      if (msg.type === "result") {
        const handler = this.pendingRequests.get(msg.id!);
        if (handler) {
          this.pendingRequests.delete(msg.id!);
          handler.resolve(msg.result);
        }
      } else if (msg.type === "error") {
        const handler = this.pendingRequests.get(msg.id!);
        if (handler) {
          this.pendingRequests.delete(msg.id!);
          console.error(
            `Error [${msg.id}]:`,
            msg.error?.code,
            msg.error?.message
          );
          handler.reject(
            new Error(`${msg.error?.code}: ${msg.error?.message}`)
          );
        }
      } else if (msg.type === "event") {
        this.handleEvent(msg);
      }
    });

    this.ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    this.ws.on("close", () => {
      console.log("Disconnected from server");
    });
  }

  private handleEvent(msg: ResponseWire): void {
    const eventWire = msg.event as any;
    console.log(
      `[Event] cid=${msg.cid} type=${eventWire.type} timestamp=${eventWire.timestamp}`
    );

    if (eventWire.type === "market") {
      const event = marketEvent.decode(eventWire);
      console.log(`  Market data: ${event.data.length} quotes`);
      if (event.data.length > 0) {
        console.log(`  Sample:`, event.data[0]);
      }
    } else if (eventWire.type === "order") {
      const event = orderEvent.decode(eventWire);
      console.log(
        `  Orders: ${event.updated.length} updated, ${event.fill.length} filled`
      );
    } else if (eventWire.type === "metrics") {
      const event = metricsEvent.decode(eventWire);
      console.log(`  Metrics:`, event.report);
    }
  }

  private send(
    method: string,
    params: unknown,
    cid?: string
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.actionId++;
      this.pendingRequests.set(id, { resolve, reject });

      const request: RequestWire = { method, id, params };
      if (cid !== undefined) {
        request.cid = cid;
      }
      this.ws.send(JSON.stringify(request));
    });
  }

  async init(): Promise<InitReponse> {
    const resultWire = await this.send("init", {});
    return init.response.decode(resultWire as any);
  }

  async login(cid: string, req: LoginRequest): Promise<LoginResponse> {
    const reqWire = login.request.encode(req);
    const resultWire = await this.send("login", reqWire, cid);
    return login.response.decode(resultWire as any);
  }

  async subscribe(
    cid: string,
    req: SubscribeRequest
  ): Promise<SubscribeResponse> {
    const reqWire = subscribe.request.encode(req);
    const resultWire = await this.send("subscribe", reqWire, cid);
    return subscribe.response.decode(resultWire as any);
  }

  async replay(req: ReplayRequest): Promise<ReplayResponse> {
    const reqWire = replay.request.encode(req);
    const resultWire = await this.send("replay", reqWire);
    return replay.response.decode(resultWire as any);
  }

  close(): void {
    this.ws.close();
  }
}

async function main() {
  const client = new TestClient("ws://localhost:8080");

  // Wait for connection
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Initialize and get available tables/ranges
  const initInfo = await client.init();
  console.log("Init:", initInfo);

  const { replayTables } = initInfo;
  if (!replayTables || replayTables.length === 0) {
    console.error("No available tables from server");
    client.close();
    return;
  }

  // Choose first available table
  const tableInfo = replayTables[0];
  const table = tableInfo.name;
  const from = tableInfo.from;
  const to = new Date(from.getTime() + 60 * 60 * 1000); // first hour

  // Login two clients
  const config1: LoginRequest = {
    config: {
      initialCash: 100000,
      commission: {
        rate: 0.0003,
        minimum: 5,
      },
    },
  };

  const config2: LoginRequest = {
    config: {
      initialCash: 200000,
      commission: {
        rate: 0.0003,
        minimum: 5,
      },
    },
  };

  const login1 = await client.login("client1", config1);
  console.log(`Login [client1]:`, login1);

  const login2 = await client.login("client2", config2);
  console.log(`Login [client2]:`, login2);

  // Subscribe to symbols
  const sub1 = await client.subscribe("client1", {
    symbols: ["000001", "600000"],
  });
  console.log(`Subscribe [client1]:`, sub1);

  const sub2 = await client.subscribe("client2", { symbols: ["*"] });
  console.log(`Subscribe [client2]:`, sub2);

  // Start replay with selected table and range
  console.log(
    `\nStarting replay for table '${table}' from ${from.toISOString()} to ${to.toISOString()}\n`
  );

  const replayResult = await client.replay({
    table,
    from,
    to,
    replayId: "replay-001",
    replayInterval: 10,
  });
  console.log("Replay finished:", replayResult);

  // Close connection
  client.close();
}

main().catch(console.error);
