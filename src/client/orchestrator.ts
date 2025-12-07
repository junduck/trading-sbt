import type { WebSocket } from "ws";
import type {
  Order,
  Position,
  OrderState,
  PartialOrder,
} from "@junduck/trading-core";
import {
  type RequestWire,
  type ResponseWire,
  type SbtEvent,
  init,
  login,
  subscribe,
  replay,
  type ReplayRequest,
  type ReplayResponse,
  submitOrders,
  amendOrders,
  cancelOrders,
  cancelAllOrders,
  getPosition,
  getOpenOrders,
  unsubscribe,
  marketEvent,
  orderEvent,
  metricsEvent,
  externalEvent,
  type InitReponse,
} from "../schema/index.js";
import type { BacktestConfig } from "../schema/backtest-config.schema.js";

type EventCallback = (event: SbtEvent) => Promise<void> | void;

export interface ClientContext {
  readonly cid: string;

  getPosition(): Promise<Position>;
  getOpenOrders(): Promise<OrderState[]>;

  submitOrders(orders: Order[]): Promise<number>;
  amendOrders(orders: PartialOrder[]): Promise<number>;
  cancelOrders(orderIds: string[]): Promise<number>;
  cancelAllOrders(): Promise<number>;

  subscribe(symbols: string[]): Promise<string[]>;
  unsubscribe(symbols: string[]): Promise<string[]>;
}

export class Orchestrator {
  private ws: WebSocket;
  private globalClientId = 0;
  private globalRequestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();

  private clients = new Map<string, EventCallback>();
  private connected = false;
  private connectionPromise: Promise<void>;

  constructor(url: string, WebSocketImpl: typeof WebSocket) {
    this.ws = new WebSocketImpl(url) as WebSocket;
    this.connectionPromise = this.setupConnection();
  }

  private setupConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => {
        this.connected = true;
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        reject(error);
      });

      this.ws.on("close", () => {
        this.connected = false;
      });
    });
  }

  private handleMessage(data: Buffer): void {
    const msg = JSON.parse(data.toString()) as ResponseWire;

    if (msg.type === "result" || msg.type === "error") {
      const handler = this.pendingRequests.get(msg.id!);
      if (!handler) return;

      this.pendingRequests.delete(msg.id!);

      if (msg.type === "error") {
        handler.reject(new Error(`${msg.error?.code}: ${msg.error?.message}`));
      } else {
        handler.resolve(msg.result);
      }
    } else if (msg.type === "event") {
      const cid = msg.cid;
      if (!cid) return; // Do not support demux yet

      const callback = this.clients.get(cid);
      if (!callback) return;

      const eventWire = msg.event as any;
      let event: SbtEvent;

      switch (eventWire.type) {
        case "market":
          event = marketEvent.decode(eventWire);
          break;
        case "order":
          event = orderEvent.decode(eventWire);
          break;
        case "metrics":
          event = metricsEvent.decode(eventWire);
          break;
        case "external":
          event = externalEvent.decode(eventWire);
          break;
        default:
          return;
      }

      void callback(event);
    }
  }

  private send(
    method: string,
    params: unknown,
    cid?: string
  ): Promise<unknown> {
    if (!this.connected) {
      return Promise.reject(new Error("WebSocket not connected"));
    }

    return new Promise((resolve, reject) => {
      const id = this.globalRequestId++;
      this.pendingRequests.set(id, { resolve, reject });

      const request: RequestWire = { method, id, params };
      if (cid !== undefined) {
        request.cid = cid;
      }
      this.ws.send(JSON.stringify(request));
    });
  }

  async waitForConnection(): Promise<void> {
    await this.connectionPromise;
  }

  async init(): Promise<InitReponse> {
    const resultWire = await this.send("init", {});
    return init.response.decode(resultWire as any);
  }

  async replay(req: ReplayRequest): Promise<ReplayResponse> {
    const reqWire = replay.request.encode(req);
    const resultWire = await this.send("replay", reqWire);
    return replay.response.decode(resultWire as any);
  }

  login(
    config: BacktestConfig,
    onEvent: EventCallback
  ): Promise<ClientContext> {
    const cid = `client-${this.globalClientId++}`;
    this.clients.set(cid, onEvent);

    return (async () => {
      const reqWire = login.request.encode({ config });
      const resultWire = await this.send("login", reqWire, cid);
      login.response.decode(resultWire as any);

      let clientOrderId = 0;

      const context: ClientContext = {
        cid,

        getPosition: async () => {
          const resultWire = await this.send("getPosition", {}, cid);
          return getPosition.response.decode(resultWire as any);
        },

        getOpenOrders: async () => {
          const resultWire = await this.send("getOpenOrders", {}, cid);
          return getOpenOrders.response.decode(resultWire as any);
        },

        submitOrders: async (orders) => {
          const ordersWithId = orders.map((order) => ({
            ...order,
            id: order.id.length ? order.id : `${cid}-${clientOrderId++}`,
          }));
          const reqWire = submitOrders.request.encode(ordersWithId);
          const resultWire = await this.send("submit", reqWire, cid);
          return submitOrders.response.decode(resultWire as any);
        },

        amendOrders: async (orders) => {
          const ordersWithId = orders.map((order) => ({
            ...order,
            id: order.id,
          }));
          const reqWire = amendOrders.request.encode(ordersWithId);
          const resultWire = await this.send("amend", reqWire, cid);
          return amendOrders.response.decode(resultWire as any);
        },

        cancelOrders: async (orderIds) => {
          const reqWire = cancelOrders.request.encode(orderIds);
          const resultWire = await this.send("cancel", reqWire, cid);
          return cancelOrders.response.decode(resultWire as any);
        },

        cancelAllOrders: async () => {
          const resultWire = await this.send("cancelAll", {}, cid);
          return cancelAllOrders.response.decode(resultWire as any);
        },
        subscribe: async (req) => {
          const reqWire = subscribe.request.encode(req);
          const resultWire = await this.send("subscribe", reqWire, cid);
          return subscribe.response.decode(resultWire as any);
        },

        unsubscribe: async (req) => {
          const reqWire = unsubscribe.request.encode(req);
          const resultWire = await this.send("unsubscribe", reqWire, cid);
          return unsubscribe.response.decode(resultWire as any);
        },
      };

      return context;
    })();
  }

  async logout(cid: string): Promise<void> {
    await this.send("logout", {}, cid);
    this.clients.delete(cid);
  }

  close(): void {
    this.ws.close();
  }
}
