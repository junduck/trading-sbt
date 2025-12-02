import { bench, describe } from "vitest";
import { buyOrder } from "@junduck/trading-core";
import { encode, decode } from "@msgpack/msgpack";
import { time } from "console";

// Create 5000 orders with different timestamps
const NUM_ORDERS = 5000;
const baseTimestamp = new Date("2025-01-01T00:00:00Z").getTime();

const orders = Array.from({ length: NUM_ORDERS }, (_, i) => {
  const timestamp = new Date(baseTimestamp + i * 1000); // 1 second apart
  return buyOrder({
    symbol: "AAPL",
    price: 150.0,
    quant: 100,
    created: timestamp,
    // Other fields can be placeholders
  });
});

// Pre-serialize for deserialization benchmarks
const serializedJSON = JSON.stringify(orders);
const serializedMsgpack = encode(orders);

describe("JSON vs MessagePack - Serialization", () => {
  bench(
    "JSON.stringify - 5000 orders",
    () => {
      JSON.stringify(orders);
    },
    { iterations: 1000 }
  );

  bench(
    "MessagePack encode - 5000 orders",
    () => {
      encode(orders);
    },
    { iterations: 1000 }
  );
});

describe("JSON vs MessagePack - Deserialization", () => {
  bench(
    "JSON.parse - 5000 orders",
    () => {
      JSON.parse(serializedJSON);
    },
    { iterations: 1000 }
  );

  bench(
    "MessagePack decode - 5000 orders",
    () => {
      decode(serializedMsgpack);
    },
    { iterations: 1000 }
  );
});

// Size comparison (logged once at startup)
console.log(`\nSize comparison for ${NUM_ORDERS} orders:`);
console.log(`  JSON:       ${serializedJSON.length.toLocaleString()} bytes`);
console.log(
  `  MessagePack: ${serializedMsgpack.length.toLocaleString()} bytes`
);
console.log(
  `  Reduction:   ${(
    (1 - serializedMsgpack.length / serializedJSON.length) *
    100
  ).toFixed(1)}%\n`
);
