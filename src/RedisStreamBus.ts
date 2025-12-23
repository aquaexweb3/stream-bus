import { createClient, RedisClientType } from "redis";
import { StreamBusEvent } from "./types";

export type StreamBusConfig = {
  redisUrl: string;
  streamBase?: string;
  maxLenCandle?: number;
  maxLenBook?: number;
  maxLenTrade?: number;
};

export class RedisStreamBus {
  private client: RedisClientType;
  private streamBase: string;
  private maxLenCandle: number;
  private maxLenBook: number;
  private maxLenTrade: number;

  constructor(config: StreamBusConfig) {
    this.client = createClient({ url: config.redisUrl });
    this.streamBase = config.streamBase ?? "md_stream";
    this.maxLenCandle = config.maxLenCandle ?? 200000;
    this.maxLenBook = config.maxLenBook ?? 300000;
    this.maxLenTrade = config.maxLenTrade ?? 500000;
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

  async publish(event: StreamBusEvent): Promise<void> {
    const entry = this.streamEntryFor(event);
    await this.client.xAdd(entry.key, "*", entry.fields, {
      TRIM: {
        strategy: "MAXLEN",
        strategyModifier: "~",
        threshold: entry.maxLen
      }
    });
  }

  private streamEntryFor(event: StreamBusEvent): {
    key: string;
    maxLen: number;
    fields: Record<string, string>;
  } {
    if (event.t === "CANDLE") {
      return {
        key: `${this.streamBase}:candle`,
        maxLen: this.maxLenCandle,
        fields: {
          ver: event.ver,
          t: event.t,
          coin: event.coin,
          interval: event.interval,
          startTs: String(event.startTs),
          o: event.o,
          h: event.h,
          l: event.l,
          c: event.c,
          v: event.v,
          isClosed: String(event.isClosed),
          eventTs: String(event.eventTs)
        }
      };
    }

    if (event.t === "BOOK_TOPN") {
      return {
        key: `${this.streamBase}:book`,
        maxLen: this.maxLenBook,
        fields: {
          ver: event.ver,
          t: event.t,
          coin: event.coin,
          depth: String(event.depth),
          bids: JSON.stringify(event.bids),
          asks: JSON.stringify(event.asks),
          eventTs: String(event.eventTs)
        }
      };
    }

    return {
      key: `${this.streamBase}:trade`,
      maxLen: this.maxLenTrade,
      fields: {
        ver: event.ver,
        t: event.t,
        coin: event.coin,
        ts: String(event.ts),
        px: event.px,
        sz: event.sz,
        side: event.side,
        eventTs: String(event.eventTs)
      }
    };
  }
}
