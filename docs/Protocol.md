# SimpleBT WebSocket Protocol

JSON-RPC like WebSocket protocol for concurrent backtest replay and simulation.

## Design Principles

- **Unified Interface**: Single WebSocket for both data and trade
- **Stateless Operations**: Client ID (`cid`) identifies session, no authentication required
- **Request-Response Pattern**: Mehod-based requests with `id` for correlation
- **Event Streaming**: Server pushes market and order events asynchronously
- **Type Safety**: JSON messages map directly to TypeScript types
- **Per connection multiplexing**: A single connection may multiplex multiple clients, enabling concurrent backtesting

## Message Format

### Request (Client → Server)

```typescript
type Request = {
  method: string;   // Method name (e.g., "submit", "subscribe")
  id: number;       // Unique ID for correlating responses
  cid: string;      // Client ID
  params: unknown;  // Action-specific parameters
}
```

### Response (Server → Client)

```typescript
type Response = {
  type: "result" | "error" | "event";
  id?: number;     // Matches request id (unique per client lifecycle)
  cid?: string     // Client ID
  result?: unknown;      // Success result when type is "result"
  event?: unknown;       // Event data when type is "event"
  error?: {              // Error details when type is "error"
    code: string;        // Error code (e.g., "INVALID_SYMBOL")
    message: string;     // Human-readable error message
  };
}
```

### Event stream (Server → Client)

```typescript
type MarketEvent = {
  type: "market";
  timestamp: Date;           // Server time when event sent
  data: MarketQuote[]; // Timestamp in market qutoes are replay time
}

type OrderEvent = {
  type: "order";
  timestamp: Date; 
  updated: OrderState[];
  fill: Fill[]; 
}

type MetricsEvent = {
  type: "metrics";
  timestamp: Date;
  report: MetricsReport;
}

type ExternalEvent = {
  type: "external";
  timestamp: Date;
  source: string;
  data: unknown;
}
```

## Actions

### Connection Management

#### init

Initialize connection with server-defined configuration. Sent automatically upon WebSocket connection.

**Request:**

```json
{
  "method": "init",
  "id": 0, // multiplexer/orchestrator level request, no cid
  "params": {
    // Optional server-defined configuration
    // Can include: protocol version, features, 
    // Initialisation of required resources, etc.
  }
}
```

**Response:**

```json
{
  "type": "result",
  "id": 0,
  "result": {
    // Server-defined initialization response
    // Can include: server version, capabilities, supported features, etc.
    "replayTables": [
      {
        "name": "ohlcv5min",
        "from": 1733390740000, //unix epoch ms
        "to":   1753890740000  //unix epoch ms
      },
      {
        "name": "tick",
        "from": 1733390740000,
        "to":   1753890740000
      }
    ]
  }
}
```

#### login/logout

Declare attendance / gracefully ask server to release resources

**Request:**

```json
{
  "method": "login",
  "id": 1,
  "cid": "client-uuid-123",
  "params": {
    "config": {
      "initialCash": 100000,
      "riskFree": 0.01,
      "commission": {
        "rate": 0.001,
        "max": 100
      },
      "slippage":{
        "price": {
          "fixed": 0.01
        },
        "volume": {
          "maxParticipation": 0.001
        }
      }
    } // backtest configuration
  }
}

{
  "method": "logout",
  "id": 10,
  "cid": "client-uuid-123",
  "params": {
    // No parameters required
  }
}
```

**Response:**

```json
{
  "type": "result",
  "id": 1,
  "cid": "client-uuid-123",
  "result": {
    "connected": true,
    "timestamp": 1734390740000, //unix epoch ms
  }
}

{
  "type": "result",
  "id": 10,
  "cid": "client-uuid-123",
  "result": {
    "disconnected": false,
    "timestamp": 1734390745000, //unix epoch ms
  }
}
```

### Data Provider Methods

#### subscribe

Subscribe to provider specified events.

**Wildcard Subscription:** Use `"*"` to subscribe to all available events.

**Request:**

```json
{
  "method": "subscribe",
  "id": 2,
  "cid": "client-uuid-123",
  "params": ["AAPL", "MSFT"]
}
```

**Wildcard Example:**

```json
{
  "method": "subscribe",
  "id": 2,
  "cid": "client-uuid-123",
  "params": ["*"]
}
```

**Response:**

```json
{
  "type": "result",
  "id": 2,
  "cid": "client-uuid-123",
  "result": ["AAPL", "MSFT"]
}
```

#### unsubscribe

Unsubscribe from market data for specified symbols.

**Request:**

```json
{
  "method": "unsubscribe",
  "id": 3,
  "cid": "client-uuid-123",
  "params": ["AAPL"]
}
```

**Response:**

```json
{
  "type": "result",
  "id": 3,
  "cid": "client-uuid-123",
  "result": ["AAPL"]
}
```

### Replay

A client-side orchestrator should manage the orchestration of multiplexed clients. This is done by asking the server to begin a replay

**Request:**

```json
{
  "method": "replay",
  "id": 5, // orchestrator level request, no cid
  "params": {
    "table": "ohlcv5min", // replay table name
    "from": 1733390740000, // unix epoch ms
    "to": 1753890740000, // unix epoch ms
    "replayId": "some_id_for_this_replay",
    "replayInterval": 50, // ms between events
    "periodicReport": 1000, // optional, report every N events
    "tradeReport": true, // optional, include per-trade report
    "endOfDayReport": true, // optional, include end of day report
    "marketMultiplex": false // optional, see below for details
  }
}
```

replayInterval: since we simulate real-time event, orchestrator can ask for some interval between event, so clients can process data without backpressure.

marketMultiplex: when true, server will batch ALL market events per replayInterval, and orchestrator is responsible to demultiplex market events to each client based on their subscription. When false, server will send market events per client subscription, which may result in duplicated data sent over the wire. Default is false.

multiplexed market data will have recipient client id of `"__multiplex__"` in the event message.

login request during replay will be rejected via error, the consideration is session prepares data upon login, not via replay

**Response:**

Data stream starts immediately, and upon replay finish:

```json
{
  "type": "result",
  "id": 5, // orchestrator level request, no cid
  "result": {
    "replayId": "some_id_for_this_replay",
    "begin": 1733390740000, // server time, unix epoch ms
    "end": 1733390840000 // server time, unix epoch ms
  }
}
```

begin and end are server wall-clock time.

### Trade Provider Methods

#### getPosition

Retrieve current position state.

**Request:**

```json
{
  "method": "getPosition",
  "id": 9,
  "cid": "client-uuid-123",
  "params": {
    // No parameters required
  }
}
```

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": {
    "cash": 100000,
    "long": {
      "AAPL": {
        "quantity": 100,
        "totalCost": 150.00,
        "realisedPnL": 500.00,
        "lots": [{
          "quantity": 100,
          "price": 150.00,
          "totalCost": 15010.00,
        },
        {
          "quantity": 50,
          "price": 155.00,
          "totalCost": 7755.00,
        }],
        "modified": 1738390740000 // unix epoch ms
      },
      "MSFT": {
        "quantity": 50,
        "totalCost": 250.00,
        "realisedPnL": 200.00,
        "lots": [{
          "quantity": 50,
          "price": 250.00,
          "totalCost": 12505.00,
        }],
        "modified": 1738390740000 // unix epoch ms
      }
    },
    "short": {
      "TSLA": {
        "quantity": 30,
        "totalProceeds": 900.00,
        "realisedPnL": 150.00,
        "lots": [{
          "quantity": 30,
          "price": 300.00,
          "totalProceeds": 8990.00,
        }],
        "modified": 1738390740000 // unix epoch ms
      }
    },
    "totalCommission": 0,
    "realisedPnL": 0,
    "modified": 1738390740000 // unix epoch ms
  }
}
```

result -> Position
Position interface using @junduck/trading-core/trading

#### getOpenOrders

Retrieve all open orders.

**Request:**

```json
{
  "method": "getOpenOrders",
  "id": 9,
  "cid": "client-uuid-123",
  "params": {
    // No parameters required
  }
}
```

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": [
    {
      "id": "order-1",
      "symbol": "AAPL",
      "side": "BUY",
      "effect": "OPEN_LONG",
      "type": "LIMIT",
      "quantity": 100,
      "price": 150.00,
      "filledQuantity": 0,
      "remainingQuantity": 100,
      "status": "OPEN",
      "modified": "2025-12-01T12:00:00Z"
    }
  ]
}
```

result -> OrderState[]
OrderState interface using @junduck/trading-core/trading

#### submitOrders

Submit one or more orders for execution.

**Request:**

```json
{
  "method": "submitOrders",
  "id": 9,
  "cid": "client-uuid-123",
  "params": [
      {
        "id": "order-1",
        "symbol": "AAPL",
        "side": "BUY",
        "effect": "OPEN_LONG",
        "type": "MARKET",
        "quantity": 100
      }
    ]
}
```

params -> Order[]
Order interface using @junduck/trading-core/trading

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": 1
}
```

#### amendOrders

Amend/modify existing orders.

**Request:**

```json
{
  "method": "amendOrders",
  "id": 9,
  "cid": "client-uuid-123",
  "params": [
      {
        "id": "order-1",
        "price": 155.00,
        "quantity": 150
      }
    ]
}
```

params -> PartialOrder[]
Order interface using @junduck/trading-core/trading

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": 1
}
```

#### cancelOrders

Cancel specific orders by ID.

**Request:**

```json
{
  "method": "cancelOrders",
  "id": 9,
  "cid": "client-uuid-123",
  "params": ["order-1", "order-2"]
}
```

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": 2
}
```

#### cancelAllOrders

Cancel all open orders (emergency action).

**Request:**

```json
{
  "method": "cancelAllOrders",
  "id": 9,
  "cid": "client-uuid-123",
  "params": {
    // No parameters required
  }
}
```

**Response:**

```json
{
  "type": "result",
  "id": 9,
  "cid": "client-uuid-123",
  "result": 3
}
```

## Error Handling

When a request fails, the response contains an `error` field instead of `result`:

```json
{
  "type": "error",
  "id": 9,
  "cid": "client-uuid-123",
  "error": {
    "code": "SYMBOL_NOT_FOUND",
    "message": "Subscribed symbol does not exist in database"
  }
}
```

Notice that order related errors only result in rejected order event.

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CLIENT` | Client ID not found or invalid |
| `INVALID_SYMBOL` | Symbol not available for trading |
| `INTERNAL_ERROR` | Server-side error |

## Implementation Notes

### Date Serialization

- All timestamps use unix epoch, in unit reported by server
- Client should parse to `Date` objects for internal use

### Position Maps

- `Position.long` and `Position.short` are Maps in TypeScript
- JSON serialization converts to object: `{"AAPL": {...}, "MSFT": {...}}`

### Batch Operations

- All order methods accept arrays for batch processing
- Server processes atomically when possible
- Partial failures return error with failed order details

### Emergency Cancel

- `cancelAllOrders` is synchronous fire-and-forget on server
- Response indicates initiated cancellation count
- Actual cancellations confirmed via order events
