"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStreamBus = void 0;
const redis_1 = require("redis");
class RedisStreamBus {
    constructor(config) {
        this.client = (0, redis_1.createClient)({ url: config.redisUrl });
        this.streamBase = config.streamBase ?? "md_stream";
        this.maxLenCandle = config.maxLenCandle ?? 200000;
        this.maxLenBook = config.maxLenBook ?? 300000;
        this.maxLenTrade = config.maxLenTrade ?? 500000;
    }
    async connect() {
        this.client.on("error", (err) => {
            console.error("redis error", err);
        });
        await this.client.connect();
    }
    async close() {
        await this.client.quit();
    }
    async publish(event) {
        const entry = this.streamEntryFor(event);
        await this.client.xAdd(entry.key, "*", entry.fields, {
            TRIM: {
                strategy: "MAXLEN",
                strategyModifier: "~",
                threshold: entry.maxLen
            }
        });
    }
    streamEntryFor(event) {
        const now = Date.now();
        if (event.t === "CANDLE") {
            return {
                key: `${this.streamBase}:candle`,
                maxLen: this.maxLenCandle,
                fields: {
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
                    eventTs: String(event.eventTs ?? now)
                }
            };
        }
        if (event.t === "BOOK_TOPN") {
            return {
                key: `${this.streamBase}:book`,
                maxLen: this.maxLenBook,
                fields: {
                    t: event.t,
                    coin: event.coin,
                    depth: String(event.depth),
                    bids: JSON.stringify(event.bids),
                    asks: JSON.stringify(event.asks),
                    eventTs: String(event.eventTs ?? now)
                }
            };
        }
        return {
            key: `${this.streamBase}:trade`,
            maxLen: this.maxLenTrade,
            fields: {
                t: event.t,
                coin: event.coin,
                ts: String(event.ts),
                px: event.px,
                sz: event.sz,
                side: event.side
            }
        };
    }
}
exports.RedisStreamBus = RedisStreamBus;
