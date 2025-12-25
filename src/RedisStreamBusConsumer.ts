import { createClient, RedisClientType } from "redis";
import {
  BookTopNStreamEvent,
  CandleStreamEvent,
  StreamBusEvent,
  TradeStreamEvent
} from "./types";

export type StreamType = "candle" | "book" | "trade";

export type StreamBusMessage = {
  id: string;
  fields: Record<string, string>;
};

export type StreamBusReadResult = {
  key: string;
  messages: StreamBusMessage[];
};

export type StreamBusMessageHandler = (message: StreamBusMessage) => void | Promise<void>;

export type StreamBusConsumerConfig = {
  redisUrl: string;
  streamBase?: string;
  groupName: string;
  consumerName: string;
  minIdleMs?: number;
  claimCount?: number;
};

export class RedisStreamBusConsumer {
  private client: RedisClientType;
  private streamBase: string;
  private groupName: string;
  private consumerName: string;
  private minIdleMs: number;
  private claimCount: number;

  constructor(config: StreamBusConsumerConfig) {
    this.client = createClient({ url: config.redisUrl });
    this.streamBase = config.streamBase ?? "md_stream";
    this.groupName = config.groupName;
    this.consumerName = config.consumerName;
    this.minIdleMs = config.minIdleMs ?? 60000;
    this.claimCount = config.claimCount ?? 100;
    this.client.on("error", (err) => {
      console.error("redis error", err);
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async ensureGroup(type: StreamType, startId = "0"): Promise<void> {
    const key = this.streamKey(type);
    try {
      await this.client.xGroupCreate(key, this.groupName, startId, { MKSTREAM: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("BUSYGROUP")) {
        throw err;
      }
    }
  }

  async readPending(type: StreamType, count?: number): Promise<StreamBusReadResult[]> {
    const key = this.streamKey(type);
    const reply = await this.client.xAutoClaim(
      key,
      this.groupName,
      this.consumerName,
      this.minIdleMs,
      "0-0",
      { COUNT: count ?? this.claimCount }
    );
    return this.normalizeAutoClaimReply(key, reply);
  }

  async readNew(
    type: StreamType,
    count = 100,
    blockMs?: number
  ): Promise<StreamBusReadResult[]> {
    const key = this.streamKey(type);
    const reply = await this.client.xReadGroup(
      this.groupName,
      this.consumerName,
      [{ key, id: ">" }],
      { COUNT: count, BLOCK: blockMs }
    );
    return this.normalizeReadReply(reply);
  }

  async processPendingAndNew(
    type: StreamType,
    handler: StreamBusMessageHandler,
    options?: {
      pendingCount?: number;
      freshCount?: number;
      blockMs?: number;
      continueOnError?: boolean;
    }
  ): Promise<void> {
    const pending = await this.readPending(type, options?.pendingCount);
    const fresh = await this.readNew(type, options?.freshCount, options?.blockMs);
    for (const batch of [...pending, ...fresh]) {
      for (const message of batch.messages) {
        try {
          await handler(message);
          await this.ack(type, message.id);
        } catch (err) {
          if (!options?.continueOnError) {
            throw err;
          }
        }
      }
    }
  }

  async ack(type: StreamType, ids: string | string[]): Promise<number> {
    const key = this.streamKey(type);
    return this.client.xAck(key, this.groupName, ids);
  }

  private streamKey(type: StreamType): string {
    return `${this.streamBase}:${type}`;
  }

  private normalizeReadReply(reply: any): StreamBusReadResult[] {
    if (!reply) return [];
    return reply.map((item: any) => ({
      key: String(item.name),
      messages: (item.messages ?? []).map((message: any) => ({
        id: String(message.id),
        fields: this.toStringFields(message.message ?? {})
      }))
    }));
  }

  private normalizeAutoClaimReply(key: string, reply: any): StreamBusReadResult[] {
    if (!reply?.messages?.length) return [];
    const messages = reply.messages
      .filter((message: any) => message)
      .map((message: any) => ({
        id: String(message.id),
        fields: this.toStringFields(message.message ?? {})
      }));
    if (!messages.length) return [];
    return [{ key, messages }];
  }

  private toStringFields(fields: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  }
}

export const decodeCandle = (fields: Record<string, string>): CandleStreamEvent | null => {
  if (fields.ver !== "1") return null;
  if (fields.t !== "CANDLE") return null;
  const startTs = Number(fields.startTs);
  if (!Number.isFinite(startTs)) return null;
  const eventTs = Number(fields.eventTs);
  if (!Number.isFinite(eventTs)) return null;
  return {
    ver: "1",
    t: "CANDLE",
    coin: fields.coin ?? "",
    interval: fields.interval ?? "",
    startTs,
    o: fields.o ?? "",
    h: fields.h ?? "",
    l: fields.l ?? "",
    c: fields.c ?? "",
    v: fields.v ?? "",
    eventTs
  };
};

export const decodeBookTopN = (fields: Record<string, string>): BookTopNStreamEvent | null => {
  if (fields.ver !== "1") return null;
  if (fields.t !== "BOOK_TOPN") return null;
  const depth = Number(fields.depth);
  if (!Number.isFinite(depth)) return null;
  const eventTs = Number(fields.eventTs);
  if (!Number.isFinite(eventTs)) return null;
  let bids: [string, string][] = [];
  let asks: [string, string][] = [];
  try {
    bids = JSON.parse(fields.bids ?? "[]");
    asks = JSON.parse(fields.asks ?? "[]");
  } catch {
    return null;
  }
  return {
    ver: "1",
    t: "BOOK_TOPN",
    coin: fields.coin ?? "",
    depth,
    bids,
    asks,
    eventTs
  };
};

export const decodeTrade = (fields: Record<string, string>): TradeStreamEvent | null => {
  if (fields.ver !== "1") return null;
  if (fields.t !== "TRADE") return null;
  const ts = Number(fields.ts);
  if (!Number.isFinite(ts)) return null;
  const eventTs = Number(fields.eventTs);
  if (!Number.isFinite(eventTs)) return null;
  const side = fields.side === "B" ? "B" : "S";
  return {
    ver: "1",
    t: "TRADE",
    coin: fields.coin ?? "",
    ts,
    px: fields.px ?? "",
    sz: fields.sz ?? "",
    side,
    eventTs
  };
};

export const decodeStreamEvent = (fields: Record<string, string>): StreamBusEvent | null => {
  if (fields.t === "CANDLE") return decodeCandle(fields);
  if (fields.t === "BOOK_TOPN") return decodeBookTopN(fields);
  if (fields.t === "TRADE") return decodeTrade(fields);
  return null;
};
