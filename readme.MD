# Stream Bus

A Redis Streams-based market data stream layer for publishing and consuming candle, order book, and trade events. The library provides a simple producer and consumer API with sensible defaults for stream trimming, idempotent consumption, and consumer group workflows.

## Features
- Redis Streams-backed event distribution with per-type streams.
- Built-in trimming via `MAXLEN ~` to control memory usage.
- Consumer group helpers for pending recovery and new reads.
- Strict TypeScript types and small API surface.

## Requirements
- Node.js 18+ (recommended)
- Redis 6+ (Streams support)

## Install
```bash
npm install @aquaexweb3/stream-bus
```

## Build
```bash
npm run build
```

## Usage

### Producer
```ts
import { RedisStreamBus } from "stream-bus";

const streamBus = new RedisStreamBus({
  redisUrl: "redis://localhost:6379",
  streamBase: "md_stream"
});

await streamBus.connect();
await streamBus.publish({
  ver: "1",
  t: "CANDLE",
  coin: "BTC",
  interval: "1m",
  startTs: 1730000000000,
  o: "43210",
  h: "43280",
  l: "43190",
  c: "43250",
  v: "123.45",
  isClosed: false,
  eventTs: 1730000000456
});
```

### Consumer
```ts
import { RedisStreamBusConsumer, decodeStreamEvent } from "stream-bus";

const consumer = new RedisStreamBusConsumer({
  redisUrl: "redis://localhost:6379",
  streamBase: "md_stream",
  groupName: "cg_storage_candle",
  consumerName: "worker-1"
});

await consumer.connect();
await consumer.ensureGroup("candle");

await consumer.processPendingAndNew(
  "candle",
  async (msg) => {
    const event = decodeStreamEvent(msg.fields);
    if (!event) return;
    // handle event...
  },
  { pendingCount: 100, freshCount: 100, blockMs: 2000, continueOnError: true }
);
```

## Streams & Schemas

Streams are split by event type:
- `md_stream:candle`
- `md_stream:book`
- `md_stream:trade`

### Candle (`md_stream:candle`)
```json
{
  "ver": "1",
  "t": "CANDLE",
  "coin": "BTC",
  "interval": "1m",
  "startTs": "1730000000000",
  "o": "43210",
  "h": "43280",
  "l": "43190",
  "c": "43250",
  "v": "123.45",
  "isClosed": "false",
  "eventTs": "1730000000456"
}
```

### Order Book TopN (`md_stream:book`)
```json
{
  "ver": "1",
  "t": "BOOK_TOPN",
  "coin": "BTC",
  "depth": "20",
  "bids": "[[\"43250\",\"1.23\"],[\"43240\",\"0.98\"]]",
  "asks": "[[\"43260\",\"1.01\"],[\"43270\",\"0.87\"]]",
  "eventTs": "1730000000567"
}
```

### Trade (`md_stream:trade`)
```json
{
  "ver": "1",
  "t": "TRADE",
  "coin": "BTC",
  "ts": "1730000000789",
  "px": "43255",
  "sz": "0.12",
  "side": "B",
  "eventTs": "1730000000800"
}
```

## Conventions
- Events are idempotent and replayable; consumers must tolerate duplicates.
- All timestamps are millisecond Unix timestamps.
- Numeric fields are stored as strings to avoid float drift.
- `bids`/`asks` are stored as JSON strings to keep Redis field counts low.

## Consumer Groups
- Use `XREADGROUP` and unique `consumerName` per process.
- Always `XACK` after successful handling.
- On restart, process pending messages before reading new entries (`>`).

## Stream Trimming
Default `MAXLEN ~` thresholds:
- Candle: 200,000
- Book: 300,000
- Trade: 500,000

Override via `maxLenCandle`, `maxLenBook`, `maxLenTrade` on `RedisStreamBus`.

## Development
- Source lives in `src/`, compiled output in `dist/`.
- TypeScript is built with `strict: true`.
- Run `npm run build` before publishing or consuming locally.

## License
This project is private; see internal repository policies for usage and distribution.
