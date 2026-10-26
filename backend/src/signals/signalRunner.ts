import { CandleBuilder } from "../market/candleBuilder.js";
import type { ClosedCandle } from "../market/candleBuilder.js";
import type { MarketEvent } from "../market/marketService.js";
import type { Candle, Strategy } from "../strategies/types.js";
import type { PublishInput } from "./signalService.js";

export const TIMEFRAME_SECONDS = 60;
// A signal is only created for a candle that finished this recently.
export const MAX_SIGNAL_AGE_MS = 90_000;
const WARM_UP_CANDLES = 100;

export type SignalRunnerDeps = {
  symbols: string[];
  strategies: Strategy[];
  watch: (symbol: string, listener: (e: MarketEvent) => void) => () => void;
  fetchCandles: (symbol: string, count: number, granularity: number) => Promise<Candle[]>;
  publish: (input: PublishInput) => Promise<{ created: boolean; id: string | null }>;
  expireOverdue: () => Promise<number>;
  now?: () => Date;
  log?: (message: string) => void;
  retryMs?: number;
  maxAttempts?: number;
  expireEveryMs?: number;
};

// Watches markets, builds 1-minute candles, runs the strategies when a candle
// finishes, and stores any signal. It only creates information; nothing trades.
export class SignalRunner {
  private readonly deps: SignalRunnerDeps;
  private running = false;
  private readonly unsubscribers: Array<() => void> = [];
  private expireTimer: NodeJS.Timeout | null = null;

  constructor(deps: SignalRunnerDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const symbol of this.deps.symbols) void this.setUp(symbol);
    this.expireTimer = setInterval(() => {
      this.deps.expireOverdue().catch((error) => this.log(`clean-up failed: ${describe(error)}`));
    }, this.deps.expireEveryMs ?? 15_000);
  }

  stop(): void {
    this.running = false;
    if (this.expireTimer) {
      clearInterval(this.expireTimer);
      this.expireTimer = null;
    }
    while (this.unsubscribers.length) this.unsubscribers.pop()!();
  }

  private async setUp(symbol: string): Promise<void> {
    const builder = new CandleBuilder(TIMEFRAME_SECONDS);
    const maxAttempts = this.deps.maxAttempts ?? 30;

    for (let attempt = 1; this.running && attempt <= maxAttempts; attempt++) {
      try {
        const history = await this.deps.fetchCandles(symbol, WARM_UP_CANDLES, TIMEFRAME_SECONDS);
        if (!this.running) return;
        builder.seed(history);
        const unwatch = this.deps.watch(symbol, (e) => this.onEvent(symbol, builder, e));
        this.unsubscribers.push(unwatch);
        this.log(`watching ${symbol} (${history.length} candles loaded)`);
        return;
      } catch (error) {
        this.log(`could not start ${symbol} (try ${attempt} of ${maxAttempts}): ${describe(error)}`);
        await new Promise((resolve) => setTimeout(resolve, this.deps.retryMs ?? 10_000));
      }
    }
    if (this.running) this.log(`giving up on ${symbol}`);
  }

  private onEvent(symbol: string, builder: CandleBuilder, e: MarketEvent): void {
    if (e.type !== "tick") return;
    const closed = builder.addTick(e.epoch, e.quote);
    if (closed) void this.onCandleClosed(symbol, builder, closed);
  }

  private async onCandleClosed(symbol: string, builder: CandleBuilder, closed: ClosedCandle): Promise<void> {
    if (closed.gapSeconds > 0) {
      this.log(`${symbol}: prices were missing for ${closed.gapSeconds}s; collecting fresh candles`);
      return;
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const ageMs = now.getTime() - (closed.candle.epoch + TIMEFRAME_SECONDS) * 1000;
    if (ageMs > MAX_SIGNAL_AGE_MS) {
      this.log(`${symbol}: candle finished ${Math.round(ageMs / 1000)}s ago, too old for a signal`);
      return;
    }

    const candles = builder.closed();
    for (const strategy of this.deps.strategies) {
      let candidate;
      try {
        candidate = strategy.evaluate(candles);
      } catch (error) {
        this.log(`${symbol}: strategy ${strategy.id} failed: ${describe(error)}`);
        continue;
      }
      if (!candidate) continue;

      try {
        const result = await this.deps.publish({
          symbol,
          timeframeSeconds: TIMEFRAME_SECONDS,
          candleEpoch: closed.candle.epoch,
          candidate,
          now,
        });
        if (result.created) this.log(`${symbol}: ${candidate.strategy} says ${candidate.direction}`);
      } catch (error) {
        this.log(`${symbol}: could not store a signal: ${describe(error)}`);
      }
    }
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}