export type CandleStreamEvent = {
  ver: "1";
  t: "CANDLE";
  coin: string;
  interval: string;
  startTs: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  eventTs: number;
};

export type BookTopNStreamEvent = {
  ver: "1";
  t: "BOOK_TOPN";
  coin: string;
  depth: number;
  bids: [string, string][];
  asks: [string, string][];
  eventTs: number;
};

export type TradeStreamEvent = {
  ver: "1";
  t: "TRADE";
  coin: string;
  ts: number;
  px: string;
  sz: string;
  side: "B" | "S";
  eventTs: number;
};

export type StreamBusEvent = CandleStreamEvent | BookTopNStreamEvent | TradeStreamEvent;
