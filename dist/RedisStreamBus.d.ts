import { StreamBusEvent } from "./types";
export type StreamBusConfig = {
    redisUrl: string;
    streamBase?: string;
    maxLenCandle?: number;
    maxLenBook?: number;
    maxLenTrade?: number;
};
export declare class RedisStreamBus {
    private client;
    private streamBase;
    private maxLenCandle;
    private maxLenBook;
    private maxLenTrade;
    constructor(config: StreamBusConfig);
    connect(): Promise<void>;
    close(): Promise<void>;
    publish(event: StreamBusEvent): Promise<void>;
    private streamEntryFor;
}
