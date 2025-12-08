import type {
  MarketQuote,
  Order,
  OrderState,
  PartialOrder,
  Position,
  Fill,
} from "@junduck/trading-core/trading";
import {
  fillOrder,
  cancelOrder,
  acceptOrder,
  processFill,
  rejectOrder,
  createPosition,
} from "@junduck/trading-core/trading";

import type { BacktestConfig } from "../schema/backtest-config.schema.js";
import { DEBUG, logger } from "../shared/logger.js";

export class BacktestBroker {
  private config: BacktestConfig;
  private position: Position;
  private openOrders: Map<string, OrderState> = new Map(); // id -> state
  private openSymbols: Map<string, number> = new Map(); // symbol -> no. open orders
  private orderIdCounter: number = 0;
  private now: Date = new Date(0);

  private readonly removeOpenSymbols: boolean;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.position = createPosition(config.initialCash);
    this.removeOpenSymbols = !DEBUG;
  }

  setTime(time: Date) {
    this.now = time;
  }

  getPosition(): Position {
    return structuredClone(this.position);
  }

  getOpenOrders(): OrderState[] {
    return Array.from(this.openOrders.values());
  }

  private incOpenSymbols(symbol: string) {
    this.openSymbols.set(symbol, (this.openSymbols.get(symbol) ?? 0) + 1);
  }

  private decOpenSymbols(symbol: string) {
    if (!this.removeOpenSymbols && (this.openSymbols.get(symbol) ?? 0) === 0) {
      // Invariant violation: decrementing non-existent symbol
      logger.warn(
        {
          symbol,
          openOrders: Object.fromEntries(this.openOrders),
          openSymbols: Object.fromEntries(this.openSymbols),
          replayTime: this.now?.toISOString(),
        },
        "Broker invariant violation: attempting to decrement non-existent symbol"
      );

      // Patch openSymbols, invariance is already broken from this point
      this.openSymbols.set(symbol, 1);
    }

    const count = this.openSymbols.get(symbol)! - 1;
    this.openSymbols.set(symbol, count);
    if (this.removeOpenSymbols && count === 0) {
      this.openSymbols.delete(symbol);
    }
  }

  getOpenSymbols(): Set<string> {
    const symbols = new Set<string>();
    for (const [symbol, count] of this.openSymbols.entries()) {
      if (count > 0) {
        symbols.add(symbol);
      }
    }
    return symbols;
  }

  submitOrder(orders: Order[]): OrderState[] {
    const submitted: OrderState[] = [];
    for (const order of orders) {
      order.created = this.now!;
      if (this.openOrders.get(order.id)) {
        // dup id: reject order
        submitted.push(rejectOrder(order));
      } else {
        const state = acceptOrder(order);
        state.modified = this.now!;
        submitted.push(state);

        this.openOrders.set(order.id, state);
        this.incOpenSymbols(order.symbol);
      }
    }

    return submitted;
  }

  amendOrder(updates: PartialOrder[]): OrderState[] {
    const updated: OrderState[] = [];
    for (const update of updates) {
      const state = this.openOrders.get(update.id);
      if (!state) {
        continue;
      }

      if (update.quantity !== undefined) {
        const filled = state.filledQuantity;
        state.quantity = update.quantity;
        state.remainingQuantity = update.quantity - filled;
      }
      if (update.price !== undefined) {
        state.price = update.price;
      }
      if (update.stopPrice !== undefined) {
        state.stopPrice = update.stopPrice;
      }
      state.modified = this.now!;

      if (state.remainingQuantity < 0) {
        cancelOrder(state);

        this.openOrders.delete(update.id);
        this.decOpenSymbols(state.symbol);
      }

      updated.push(state);
    }

    return updated;
  }

  cancelOrder(ids: string[]): OrderState[] {
    const cancelled: OrderState[] = [];
    for (const id of ids) {
      const state = this.openOrders.get(id);
      if (!state) {
        continue;
      }
      cancelOrder(state);
      state.modified = this.now!;
      cancelled.push(state);

      this.openOrders.delete(id);
      this.decOpenSymbols(state.symbol);
    }

    return cancelled;
  }

  cancelAllOrders(): OrderState[] {
    const count = this.openOrders.size;
    if (count === 0) return [];

    const states = Array.from(this.openOrders.values());
    const cancelled: OrderState[] = [];

    for (const state of states) {
      cancelOrder(state);
      state.modified = this.now!;
      cancelled.push(state);
    }
    this.openOrders.clear();
    this.openSymbols.clear();

    return cancelled;
  }

  // When new batch of market data loaded, match pending order and return exec results
  processPendingOrders(quotes: MarketQuote[]) {
    // First, check and convert stop orders
    const converted = this.processStopOrders(quotes);

    // Then process normal orders (including converted ones)
    const result = this.processNormalOrders(quotes);

    // Combine converted orders with execution results
    return {
      updated: [...converted, ...result.updated],
      filled: result.filled,
    };
  }

  /**
   * Check stop orders and convert to normal orders if stop condition met.
   * STOP → MARKET, STOP_LIMIT → LIMIT
   * Returns converted orders as they updated order type
   */
  private processStopOrders(quotes: MarketQuote[]): OrderState[] {
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    const converted: OrderState[] = [];

    for (const state of this.openOrders.values()) {
      if (state.type !== "STOP" && state.type !== "STOP_LIMIT") continue;

      const quote = quoteMap.get(state.symbol);
      if (!quote || !state.stopPrice) continue;

      // Check if stop condition is met
      const stopTriggered =
        state.side === "BUY"
          ? quote.price >= state.stopPrice
          : quote.price <= state.stopPrice;

      if (stopTriggered) {
        // Convert order type in-place
        state.type = state.type === "STOP" ? "MARKET" : "LIMIT";
        state.modified = this.now!;

        converted.push(structuredClone(state));
      }
    }

    return converted;
  }

  /**
   * Process normal orders (MARKET and LIMIT) and execute fills
   */
  private processNormalOrders(quotes: MarketQuote[]) {
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    const updated: OrderState[] = [];
    const filled: Fill[] = [];

    for (const [id, state] of Array.from(this.openOrders.entries())) {
      // Only process normal orders (STOP orders should have been converted)
      if (state.type !== "MARKET" && state.type !== "LIMIT") continue;

      const quote = quoteMap.get(state.symbol);
      if (!quote) continue;

      // Determine base fill price from order type
      const fillPrice = this.getMatchPrice(state, quote);
      if (fillPrice === null) continue;

      // Apply volume slippage: calculate fillable quantity
      const fillQuant = this.getFillQuantity(state, quote);
      if (fillQuant === 0) continue;

      // Apply price slippage: adjust fill price
      const slippage = this.getPriceSlippage(
        fillPrice,
        fillQuant,
        state.side,
        quote.volume
      );
      const adjFillPrice = fillPrice + slippage;

      // Calculate commission
      const commission = this.getCommission(adjFillPrice, fillQuant);

      // Fill the order, fillOrder updates state by ref (including time)
      const fill = fillOrder({
        state,
        id: `fill_${this.orderIdCounter++}`,
        price: adjFillPrice,
        quant: fillQuant,
        commission,
        created: this.now!,
      });

      // Update position
      processFill(this.position, fill, "FIFO");

      // Collect updated order and fill
      updated.push(state);
      filled.push(fill);

      // Remove from pending if fully filled
      if (state.status === "FILLED") {
        this.openOrders.delete(id);
        this.decOpenSymbols(state.symbol);
      }
    }

    return {
      updated,
      filled,
    };
  }

  /**
   * Get correct match price for normal orders (MARKET/LIMIT), null if no match.
   * STOP orders should be converted to normal orders before calling this.
   */
  private getMatchPrice(order: Order, quote: MarketQuote): number | null {
    switch (order.type) {
      case "MARKET":
        return order.side === "BUY"
          ? quote.ask ?? quote.price
          : quote.bid ?? quote.price;

      case "LIMIT":
        if (!order.price) return null;
        if (order.side === "BUY") {
          const effectiveAsk = quote.ask ?? quote.price;
          return effectiveAsk <= order.price ? effectiveAsk : null;
        } else {
          const effectiveBid = quote.bid ?? quote.price;
          return effectiveBid >= order.price ? effectiveBid : null;
        }

      default:
        return null;
    }
  }

  /**
   * Calculate maximum fillable quantity based on volume constraints
   */
  private getFillQuantity(state: OrderState, quote: MarketQuote): number {
    const volumeConfig = this.config.slippage?.volume;
    if (!volumeConfig || !quote.volume) {
      return state.remainingQuantity;
    }

    // Calculate max allowed quantity based on volume participation
    if (volumeConfig.maxParticipation) {
      const maxQty = quote.volume * volumeConfig.maxParticipation;

      if (state.remainingQuantity > maxQty) {
        // Partial fill allowed
        if (volumeConfig.allowPartialFills) {
          return maxQty;
        }
        // Reject entire order
        return 0;
      }
    }

    return state.remainingQuantity;
  }

  /**
   * Calculate price slippage adjustment
   */
  private getPriceSlippage(
    price: number,
    quant: number,
    side: "BUY" | "SELL",
    barVolume?: number
  ): number {
    const priceConfig = this.config.slippage?.price;
    if (!priceConfig) return 0;

    let totalSlippage = 0;

    // Fixed slippage (in basis points)
    if (priceConfig.fixed) {
      totalSlippage += (priceConfig.fixed / 10000) * price;
    }

    // Market impact based on volume participation
    if (priceConfig.marketImpact && barVolume && barVolume > 0) {
      const volumePct = quant / barVolume;
      totalSlippage += volumePct * priceConfig.marketImpact * price;
    }

    // Apply slippage direction (buy = higher, sell = lower)
    return side === "BUY" ? totalSlippage : -totalSlippage;
  }

  /**
   * Calculate commission for a trade
   */
  private getCommission(price: number, quant: number): number {
    const notional = price * quant;
    const commission = this.config.commission;
    if (!commission) return 0;

    // Complex commission structure
    let totalCommission = 0;
    if (commission.rate) {
      totalCommission += notional * commission.rate;
    }
    if (commission.perTrade) {
      totalCommission += commission.perTrade;
    }

    // Apply min/max constraints
    if (commission.minimum && totalCommission < commission.minimum) {
      totalCommission = commission.minimum;
    }
    if (commission.maximum && totalCommission > commission.maximum) {
      totalCommission = commission.maximum;
    }

    return totalCommission;
  }
}
