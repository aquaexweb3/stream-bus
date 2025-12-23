export type CandleStreamEvent = {
    t: "CANDLE";
    coin: string;
    interval: string;
    startTs: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    isClosed: boolean;
    eventTs?: number;
};
export type BookTopNStreamEvent = {
    t: "BOOK_TOPN";
    coin: string;
    depth: number;
    bids: [string, string][];
    asks: [string, string][];
    eventTs?: number;
};
export type TradeStreamEvent = {
    t: "TRADE";
    coin: string;
    ts: number;
    px: string;
    sz: string;
    side: "B" | "S";
};
export type StreamBusEvent = CandleStreamEvent | BookTopNStreamEvent | TradeStreamEvent;
