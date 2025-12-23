Stream Bus（Market Data Stream Layer）
1. 背景与目标

在本项目中，Market Data Ingestor 负责从 Hyperliquid 实时接入行情数据（K 线、L2 订单簿、成交等），并进行必要的状态维护与节流。

Stream Bus 的目标是：

将 Ingestor 产生的行情事件 可靠地分发 给多个下游服务

实现 生产者与消费者解耦

支持 断点续消费、回放、扩展多个消费者

避免实时展示、落库、指标计算之间互相影响

本项目使用 Redis Streams 作为 Stream Bus，并 按事件类型拆分 stream。

2. 架构位置
Hyperliquid
     │
     ▼
Market Data Ingestor
     │
     ├── Redis PubSub（实时、低延迟，用于前端）
     │
     └── Redis Streams（Stream Bus，可靠）
             │
             ├── Realtime Gateway（可选从 PubSub）
             ├── Storage Writer（落库）
             ├── Indicator Engine（指标计算）
             └── Other Consumers（告警 / 回放 / 分析）


⚠️ 注意

PubSub ≠ Stream Bus

Stream Bus 指的是 Redis Streams 这一层

3. Stream 拆分策略

我们按 事件类型 拆分 stream，而不是按 market 拆分。

Stream 列表
Stream Key	说明
md_stream:candle	K 线事件（1m / 1h / 1d）
md_stream:book	L2 订单簿 Top20
md_stream:trade	逐笔成交（可选）

拆分原因：

不同消费者关注的数据类型不同

避免单一 stream 消费压力不均

更清晰的 consumer group 职责划分

4. 事件通用规范（非常重要）
4.1 基本原则

所有事件必须是幂等可重放的

不依赖消费顺序之外的隐式状态

时间统一使用 毫秒级 Unix timestamp

数值字段统一使用 string（避免浮点误差）

5. Stream 数据结构定义
5.1 Candle Stream（md_stream:candle）
Event Schema
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

字段说明
字段	说明
t	固定为 CANDLE
coin	市场标识（如 BTC）
interval	1m / 1h / 1d
startTs	K 线开始时间
o/h/l/c/v	OHLCV
isClosed	是否已收盘
eventTs	事件产生时间（ingestor）
5.2 Order Book Stream（md_stream:book）
Event Schema（Top20）
{
  "ver": "1",
  "t": "BOOK_TOPN",
  "coin": "BTC",
  "depth": "20",
  "bids": "[[\"43250\",\"1.23\"],[\"43240\",\"0.98\"]]",
  "asks": "[[\"43260\",\"1.01\"],[\"43270\",\"0.87\"]]",
  "eventTs": "1730000000567"
}


⚠️ bids / asks 使用 JSON string 存储，避免 Redis field 数量过多

字段说明
字段	说明
t	固定为 BOOK_TOPN
coin	市场标识
depth	固定为 20
bids	买盘（价格降序）
asks	卖盘（价格升序）
eventTs	事件产生时间
5.3 Trade Stream（md_stream:trade）（可选）
Event Schema
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

6. 消费者组（Consumer Groups）设计
推荐的 Consumer Groups
Candle Stream

cg_storage_candle

cg_indicator_candle

Book Stream

cg_storage_book（可选，通常只存快照）

cg_indicator_book（可选）

Trade Stream

cg_storage_trade

cg_indicator_trade

不同 stream 不要复用 consumer group 名称

7. 消费模式与约定
7.1 消费模式

使用 XREADGROUP

每个 consumer 有唯一 consumerName

成功处理后必须 XACK

失败不 ACK，由 pending list 保留

7.2 重启与恢复

服务重启后：

先处理 XPENDING 中未 ack 的消息

再读取新消息（>）

7.3 幂等要求（必须遵守）

消费者在处理事件时：

必须允许 重复事件

以 (coin, interval, startTs) 或 (coin, eventTs) 作为去重键

数据库写入必须使用 upsert / replace 语义

8. Stream 长度控制（防止 Redis 爆内存）
建议策略（由 Ingestor 执行）
XADD md_stream:candle MAXLEN ~ 200000 ...
XADD md_stream:book   MAXLEN ~ 300000 ...
XADD md_stream:trade  MAXLEN ~ 500000 ...


使用 ~（近似修剪）

保证最近 1～3 天数据可回放（按吞吐量调整）

9. Stream Bus 不负责的事情（明确边界）

❌ 不做实时转发给浏览器（那是 Gateway 的职责）
❌ 不保证严格实时（相比 PubSub 有毫秒～秒级延迟）
❌ 不负责业务指标定义
❌ 不做跨事件类型的强一致性保证

10. 典型使用示例
Storage Writer

消费 md_stream:candle

upsert 写入 OHLCV 表

消费 md_stream:trade

记录成交（或聚合后写）

Indicator Engine

消费 candle / trade

计算 RSI / EMA / MACD

结果写 Redis KV（供 API / UI 读取）

11. 为什么我们选择 Redis Streams 而不是 Kafka？

在当前阶段（Top10 市场）：

吞吐量低

架构简单优先

Redis 已经是依赖组件

未来如果：

市场数 > 100

多 region

TB 级历史回放

可以无缝将 Stream Bus 迁移到 Kafka（事件 schema 不变）。

12. 开发约定总结（TL;DR）

Ingestor = 唯一生产者

Streams = 可靠分发层

每个消费者 必须 ack

所有消费者 必须幂等

不在 Stream Bus 做业务逻辑

---
13. Node.js/TypeScript 库用法（Producer）

```ts
import { RedisStreamBus } from "stream-bus";

const streamBus = new RedisStreamBus({
  redisUrl: "redis://localhost:6379",
  streamBase: "md_stream"
});

await streamBus.connect();
await streamBus.publish({
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

该库只负责写 Redis Streams，不包含 PubSub。

---
14. Node.js/TypeScript 库用法（Consumer）

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

const pending = await consumer.readPending("candle", 100);
const fresh = await consumer.readNew("candle", 100, 2000);

for (const batch of [...pending, ...fresh]) {
  for (const msg of batch.messages) {
    const event = decodeStreamEvent(msg.fields);
    if (event) {
      // handle event...
      await consumer.ack("candle", msg.id);
    }
  }
}
```

Consumer 侧按 readme 约定：先处理 pending，再读取新消息（>），处理成功后必须 ack。
