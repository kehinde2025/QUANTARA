import type { Candle } from "../strategies/types.js";

export type ClosedCandle = {
  candle: Candle;
  // Seconds of missing candles between this candle and the next tick.
  // 0 means no gap.
  gapSeconds: number;
};

// Builds fixed-length candles (default 1 minute) from a stream of ticks.
export class CandleBuilder {
  private readonly granularity: number;
  private readonly maxClosed: number;
  private closedList: Candle[] = [];
  private current: Candle | null = null;

  constructor(granularity = 60, maxClosed = 300) {
    this.granularity = granularity;
    this.maxClosed = maxClosed;
  }

  // Starts from Deriv's history. The newest candle may still be forming, so it
  // becomes the current candle and keeps updating from live ticks.
  seed(candles: Candle[]): void {
    const byEpoch = new Map<number, Candle>();
    for (const c of candles) byEpoch.set(c.epoch, c);
    const sorted = [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch);
    const newest = sorted.pop() ?? null;
    this.closedList = sorted.slice(-this.maxClosed);
    this.current = newest ? { ...newest } : null;
  }

  // Adds one live tick. Returns the candle that just finished, if one did.
  addTick(epoch: number, quote: number): ClosedCandle | null {
    const bucket = Math.floor(epoch / this.granularity) * this.granularity;
    const cur = this.current;

    if (!cur) {
      this.current = this.fresh(bucket, quote);
      return null;
    }
    if (bucket < cur.epoch) return null; // older than the minute we are building
    if (bucket === cur.epoch) {
      cur.high = Math.max(cur.high, quote);
      cur.low = Math.min(cur.low, quote);
      cur.close = quote;
      return null;
    }

    const gapSeconds = bucket - (cur.epoch + this.granularity);
    if (gapSeconds > 0) {
      // Minutes are missing. Candles from before and after a gap must not be
      // treated as neighbours, so the older ones are dropped.
      this.closedList = [];
    } else {
      this.closedList.push(cur);
      if (this.closedList.length > this.maxClosed) {
        this.closedList.splice(0, this.closedList.length - this.maxClosed);
      }
    }
    this.current = this.fresh(bucket, quote);
    return { candle: cur, gapSeconds };
  }

  // Finished candles, oldest first.
  closed(): Candle[] {
    return [...this.closedList];
  }

  private fresh(epoch: number, quote: number): Candle {
    return { epoch, open: quote, high: quote, low: quote, close: quote };
  }
}