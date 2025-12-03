# SimpleBT WebSocket Protocol

JSON-RPC like WebSocket protocol for concurrent backtest replay and simulation.

## Design Principles

- **Unified Interface**: Single WebSocket for both data and trade
- **Stateless Operations**: Client ID (`cid`) identifies session, no authentication required
- **Request-Response Pattern**: Action-based requests with `action_id` for correlation
- **Event Streaming**: Server pushes market and order events asynchronously
- **Type Safety**: JSON messages map directly to TypeScript types
- **Per connection multiplexing**: A single connection may multiplex multiple clients, enabling concurrent backtesting

## Message Format

### Request (Client → Server)

```typescript
interface Request {
  action: string;        // Action name (e.g., "submit", "subscribe")
  action_id: number;     // Unique ID for correlating responses
  params: unknown;       // Action-specific parameters
}
```

### Response (Server → Client)

```typescript
interface Response {
  type: "response";
  action_id: number;     // Matches request action_id (globally unique per connection)
  result?: unknown;      // Success result
  error?: {              // Error details (mutually exclusive with result)
    code: string;        // Error code (e.g., "INVALID_SYMBOL")
    message: string;     // Human-readable error message
  };
}
```

### Event stream (Server → Client)

```typescript
interface Event {
  type: "market" | "order";
  cid: string;           // Client ID (routes event to specific client)
  data: unknown;         // Event-specific data
  timestamp: number;     // Unix epoch timestamp
}
```

## Actions

### Connection Management

#### init

Initialize connection with server-defined configuration. Sent automatically upon WebSocket connection.

**Request:**

```json
{
  "action": "init",
  "action_id": 0,
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
  "type": "response",
  "action_id": 0,
  "result": {
    // Server-defined initialization response
    // Can include: server version, capabilities, supported features, etc.
  }
}
```

#### login/logout

Declare attendance / gracefully ask server to release resources

**Request:**

```json
{
  "action": "login" | "logout",
  "action_id": 1,
  "params": {
    "cid": "client-uuid-123",
    "config": BacktestConfig
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 1,
  "result": {
    "connected": true,
    "timestamp": "2024-01-15T10:30:00.000Z",
  }
}
```

### Data Provider Methods

#### subscribe

Subscribe to market data for specified symbols.

**Wildcard Subscription:** Use `"*"` to subscribe to all available symbols.

**Request:**

```json
{
  "action": "subscribe",
  "action_id": 2,
  "params": {
    "cid": "client-uuid-123",
    "symbols": ["AAPL", "MSFT"]
  }
}
```

**Wildcard Example:**

```json
{
  "action": "subscribe",
  "action_id": 2,
  "params": {
    "cid": "client-uuid-123",
    "symbols": ["*"]
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 2,
  "result": {
    "subscribed": ["AAPL", "MSFT"]
  }
}
```

#### unsubscribe

Unsubscribe from market data for specified symbols.

**Request:**

```json
{
  "action": "unsubscribe",
  "action_id": 3,
  "params": {
    "cid": "client-uuid-123",
    "symbols": ["AAPL"]
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 3,
  "result": {
    "unsubscribed": ["AAPL"]
  }
}
```

### Replay

A client-side orchestrator should manage the orchestration of multiplexed clients. This is done by asking the server to begin a replay

**Request:**

```json
{
  "action": "replay",
  "action_id": 5,
  "params": {
    "from": "2024-01-15T10:30:00.000Z",
    "to": "2024-01-20T10:30:00.000Z",
    "interval": 1000, 
    "replay_id": "some_id_for_this_replay"
  }
}
```

interval: since we simulate real-time event, orchestrator can ask for some interval between event, so clients can process data without backpressure.

login request during replay will be rejected via error, the consideration is session prepares data upon login, not via replay

**Response:**

Data stream starts immediately, and upon replay finish:

```json
{
  "action": "response",
  "action_id": 5,
  "result": {
    "replay_finished": "some_id_for_this_replay",
    "begin": "2025-01-20T10:30:00.000Z",
    "end": "2025-01-20T10:30:10.000Z"
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
  "action": "getPosition",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123"
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
  "result": {
    "cash": 100000,
    "long": {},
    "short": {},
    "totalCommission": 0,
    "realisedPnL": 0,
    "modified": "2025-12-01T12:00:00Z"
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
  "action": "getOpenOrders",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123"
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
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
  "action": "submitOrders",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123",
    "orders": [
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
}
```

orders -> Order[]
Order interface using @junduck/trading-core/trading

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
  "result": {
    "submitted": 1
  }
}
```

#### amendOrders

Amend/modify existing orders.

**Request:**

```json
{
  "action": "amendOrders",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123",
    "updates": [
      {
        "id": "order-1",
        "price": 155.00,
        "quantity": 150
      }
    ]
  }
}
```

updates -> Partial<Order>[]
Order interface using @junduck/trading-core/trading

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
  "result": {
    "amended": 1
  }
}
```

#### cancelOrders

Cancel specific orders by ID.

**Request:**

```json
{
  "action": "cancelOrders",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123",
    "orderIds": ["order-1", "order-2"]
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
  "result": {
    "cancelled": 2
  }
}
```

#### cancelAllOrders

Cancel all open orders (emergency action).

**Request:**

```json
{
  "action": "cancelAllOrders",
  "action_id": 9,
  "params": {
    "cid": "client-uuid-123"
  }
}
```

**Response:**

```json
{
  "type": "response",
  "action_id": 9,
  "result": {
    "cancelled": 5
  }
}
```

## Events

Events are pushed asynchronously from server to client. No `action_id` correlation.

**Important**: Events MUST include `cid` to route to the correct client session.

export interface BaseEvent {
  type: "market" | "external" | "order";
  timestamp: Date;
}

### Market Event

Streamed when market data is available for subscribed symbols.

```json
{
  "type": "event",
  "cid": "client-uuid-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": MarketEvent
}
```

data -> MarketEvent
export interface MarketEvent extends BaseEvent {
  type: "market";
  marketData: MarketQuote[];
}
MarketQuote interface using @junduck/trading-core/trading

### Order Event

Streamed when order state changes or fills occur.

```json
{
  "type": "event",
  "cid": "client-uuid-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": OrderEvent
}
```

data -> OrderEvent
export interface OrderEvent extends BaseEvent {
  type: "order";
  updated: OrderState[];
  fill: Fill[];
}
OrderState and Fill interface using @junduck/trading-core/trading

## External Event

Streamed when external event data is available for subscribed symbols (News, external signals etc), streaming external event may not be supported

```json
{
  "type": "event",
  "cid": "client-uuid-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": ExternalEvent
}
```

data -> ExternalEvent
export interface ExternalEvent extends BaseEvent {
  type: "external";
  /** Source identifier (e.g., "news", "ml-predictor", "sentiment") */
  source: string;
  /** Provider-specific data payload */
  data: unknown;
}

## Error Handling

When a request fails, the response contains an `error` field instead of `result`:

```json
{
  "type": "INVALID_SYMBOL",
  "action_id": 9,
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
