"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStreamEvent = exports.decodeTrade = exports.decodeBookTopN = exports.decodeCandle = exports.RedisStreamBusConsumer = void 0;
const redis_1 = require("redis");
class RedisStreamBusConsumer {
    constructor(config) {
        this.client = (0, redis_1.createClient)({ url: config.redisUrl });
        this.streamBase = config.streamBase ?? "md_stream";
        this.groupName = config.groupName;
        this.consumerName = config.consumerName;
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
    async ensureGroup(type, startId = "0") {
        const key = this.streamKey(type);
        try {
            await this.client.xGroupCreate(key, this.groupName, startId, { MKSTREAM: true });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes("BUSYGROUP")) {
                throw err;
            }
        }
    }
    async readPending(type, count = 100) {
        const key = this.streamKey(type);
        const reply = await this.client.xReadGroup(this.groupName, this.consumerName, [{ key, id: "0" }], { COUNT: count });
        return this.normalizeReadReply(reply);
    }
    async readNew(type, count = 100, blockMs) {
        const key = this.streamKey(type);
        const reply = await this.client.xReadGroup(this.groupName, this.consumerName, [{ key, id: ">" }], { COUNT: count, BLOCK: blockMs });
        return this.normalizeReadReply(reply);
    }
    async ack(type, ids) {
        const key = this.streamKey(type);
        return this.client.xAck(key, this.groupName, ids);
    }
    streamKey(type) {
        return `${this.streamBase}:${type}`;
    }
    normalizeReadReply(reply) {
        if (!reply)
            return [];
        return reply.map((item) => ({
            key: String(item.name),
            messages: (item.messages ?? []).map((message) => ({
                id: String(message.id),
                fields: this.toStringFields(message.message ?? {})
            }))
        }));
    }
    toStringFields(fields) {
        const out = {};
        for (const [key, value] of Object.entries(fields)) {
            out[key] = typeof value === "string" ? value : String(value);
        }
        return out;
    }
}
exports.RedisStreamBusConsumer = RedisStreamBusConsumer;
const decodeCandle = (fields) => {
    if (fields.t !== "CANDLE")
        return null;
    const startTs = Number(fields.startTs);
    if (!Number.isFinite(startTs))
        return null;
    const eventTs = fields.eventTs ? Number(fields.eventTs) : undefined;
    return {
        t: "CANDLE",
        coin: fields.coin ?? "",
        interval: fields.interval ?? "",
        startTs,
        o: fields.o ?? "",
        h: fields.h ?? "",
        l: fields.l ?? "",
        c: fields.c ?? "",
        v: fields.v ?? "",
        isClosed: fields.isClosed === "true",
        eventTs: Number.isFinite(eventTs ?? NaN) ? eventTs : undefined
    };
};
exports.decodeCandle = decodeCandle;
const decodeBookTopN = (fields) => {
    if (fields.t !== "BOOK_TOPN")
        return null;
    const depth = Number(fields.depth);
    if (!Number.isFinite(depth))
        return null;
    let bids = [];
    let asks = [];
    try {
        bids = JSON.parse(fields.bids ?? "[]");
        asks = JSON.parse(fields.asks ?? "[]");
    }
    catch {
        return null;
    }
    const eventTs = fields.eventTs ? Number(fields.eventTs) : undefined;
    return {
        t: "BOOK_TOPN",
        coin: fields.coin ?? "",
        depth,
        bids,
        asks,
        eventTs: Number.isFinite(eventTs ?? NaN) ? eventTs : undefined
    };
};
exports.decodeBookTopN = decodeBookTopN;
const decodeTrade = (fields) => {
    if (fields.t !== "TRADE")
        return null;
    const ts = Number(fields.ts);
    if (!Number.isFinite(ts))
        return null;
    const side = fields.side === "B" ? "B" : "S";
    return {
        t: "TRADE",
        coin: fields.coin ?? "",
        ts,
        px: fields.px ?? "",
        sz: fields.sz ?? "",
        side
    };
};
exports.decodeTrade = decodeTrade;
const decodeStreamEvent = (fields) => {
    if (fields.t === "CANDLE")
        return (0, exports.decodeCandle)(fields);
    if (fields.t === "BOOK_TOPN")
        return (0, exports.decodeBookTopN)(fields);
    if (fields.t === "TRADE")
        return (0, exports.decodeTrade)(fields);
    return null;
};
exports.decodeStreamEvent = decodeStreamEvent;
