import { BookTopNStreamEvent, CandleStreamEvent, StreamBusEvent, TradeStreamEvent } from "./types";
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
export declare class RedisStreamBusConsumer {
    private client;
    private streamBase;
    private groupName;
    private consumerName;
    private minIdleMs;
    private claimCount;
    constructor(config: StreamBusConsumerConfig);
    connect(): Promise<void>;
    close(): Promise<void>;
    ensureGroup(type: StreamType, startId?: string): Promise<void>;
    readPending(type: StreamType, count?: number): Promise<StreamBusReadResult[]>;
    readNew(type: StreamType, count?: number, blockMs?: number): Promise<StreamBusReadResult[]>;
    processPendingAndNew(type: StreamType, handler: StreamBusMessageHandler, options?: {
        pendingCount?: number;
        freshCount?: number;
        blockMs?: number;
        continueOnError?: boolean;
    }): Promise<void>;
    ack(type: StreamType, ids: string | string[]): Promise<number>;
    private streamKey;
    private normalizeReadReply;
    private normalizeAutoClaimReply;
    private toStringFields;
}
export declare const decodeCandle: (fields: Record<string, string>) => CandleStreamEvent | null;
export declare const decodeBookTopN: (fields: Record<string, string>) => BookTopNStreamEvent | null;
export declare const decodeTrade: (fields: Record<string, string>) => TradeStreamEvent | null;
export declare const decodeStreamEvent: (fields: Record<string, string>) => StreamBusEvent | null;
