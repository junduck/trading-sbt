# Example Usage

This directory contains example scripts demonstrating how to use the trading-sbt server.

## Setup

The example includes `sample_data.db` - a small sample database with 3 timestamps:

- **Size**: 2.1 MB
- **Rows**: 19,413
- **Symbols**: 6,880
- **Time range**: 2025-11-28 14:30:00 to 15:00:00 (CST/UTC+8)
- **Table**: ohlcv_15m

The `config.json` file configures the database connection:

```json
{
  "dbPath": "sample_data.db",
  "price": "close",
  "timestamp": "timestamp",
  "epoch": "s"
}
```

## Running the Example

### Start the Server

In one terminal:

```bash
pnpm example:server
```

### Run the Client

In another terminal:

```bash
pnpm example:client
```

## What the Client Does

The example client demonstrates:

1. **Connection**: Connects to the WebSocket server at `ws://localhost:8080`
2. **Initialization**: Sends an `init` request
3. **Login**: Logs in two clients:
   - `client1`: 100,000 initial cash
   - `client2`: 200,000 initial cash
4. **Subscription**:
   - `client1`: Subscribes to symbols `000001` and `600000`
   - `client2`: Subscribes to symbols `000002` and `600000`
5. **Replay**: Replays market data from `2025-11-28T14:30:00+08:00` to `2025-11-28T15:00:00+08:00`
6. **Events**: Listens for order and market data events

## Output

The client will log:

- Connection status
- Response results for each action
- Market data events (showing quote counts and samples)
- Order events (showing updated and filled orders)
- Replay completion
