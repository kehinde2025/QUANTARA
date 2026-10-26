import { describe, expect, it, vi } from "vitest";
import type { MarketEvent } from "../market/marketService.js";
import type { Candle, Strategy } from "../strategies/types.js";
import { SignalRunner } from "./signalRunner.js";
import type { SignalRunnerDeps } from "./signalRunner.js";
import type { PublishInput } from "./signalService.js";

const candle = (epoch: number, close: number): Candle => ({ epoch, open: close, high: close, low: close, close });
const HISTORY = [candle(60, 1), candle(120, 2), candle(180, 3)];

// Always sees a chance and records how many finished candles it was shown.
const always: Strategy = {
  id: "always",
  evaluate: (candles) => ({
    strategy: "always",
    direction: "rise",
    contractType: "CALL",
    reason: "test",
    details: { n: candles.length },
  }),
};

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const pause = (ms = 25) => new Promise((r) => setTimeout(r, ms));

function setup(over: Partial<SignalRunnerDeps> = {}) {
  let listener: ((e: MarketEvent) => void) | null = null;
  let nowSec = 241; // one second after the minute starting at 180 ends
  const published: PublishInput[] = [];
  const unwatch = vi.fn();

  const deps: SignalRunnerDeps = {
    symbols: ["R_100"],
    strategies: [always],
    watch: (_symbol, l) => {
      listener = l;
      return unwatch;
    },
    fetchCandles: async () => HISTORY,
    publish: async (input) => {
      published.push(input);
      return { created: true, id: "id" };
    },
    expireOverdue: async () => 0,
    now: () => new Date(nowSec * 1000),
    log: () => {},
    retryMs: 5,
    expireEveryMs: 60_000,
    ...over,
  };

  const runner = new SignalRunner(deps);
  const tick = (epoch: number, quote = 10) =>
    listener!({ type: "tick", symbol: "R_100", quote, epoch, decimals: 2 });

  return {
    runner,
    published,
    unwatch,
    tick,
    isWatching: () => listener !== null,
    setNow: (s: number) => {
      nowSec = s;
    },
  };
}

describe("SignalRunner", () => {
  it("stores a signal when a strategy fires on a candle that just finished", async () => {
    const t = setup();
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.tick(185);
    t.tick(240); // minute 180 is now finished
    await waitFor(() => t.published.length === 1);
    expect(t.published[0]!.symbol).toBe("R_100");
    expect(t.published[0]!.timeframeSeconds).toBe(60);
    expect(t.published[0]!.candleEpoch).toBe(180);
    expect(t.published[0]!.candidate.strategy).toBe("always");
    expect(t.published[0]!.candidate.details.n).toBe(3); // candles 60, 120 and 180
    t.runner.stop();
  });

  it("does nothing while a candle is still forming", async () => {
    const t = setup();
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.tick(185);
    t.tick(190);
    await pause();
    expect(t.published).toHaveLength(0);
    t.runner.stop();
  });

  it("forgets older candles after a gap and starts again from fresh ones", async () => {
    const t = setup();
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.tick(185);
    t.tick(400); // minutes 240 and 300 are missing
    await pause();
    expect(t.published).toHaveLength(0);

    t.setNow(421);
    t.tick(420); // minute 360 finishes right after the gap
    await waitFor(() => t.published.length === 1);
    expect(t.published[0]!.candleEpoch).toBe(360);
    expect(t.published[0]!.candidate.details.n).toBe(1); // only the fresh candle
    t.runner.stop();
  });

  it("refuses a candle that finished too long ago", async () => {
    const t = setup();
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.setNow(10_000);
    t.tick(185);
    t.tick(240);
    await pause();
    expect(t.published).toHaveLength(0);
    t.runner.stop();
  });

  it("loads history before it starts watching", async () => {
    const order: string[] = [];
    const t = setup({
      fetchCandles: async () => {
        order.push("fetch");
        return HISTORY;
      },
      watch: () => {
        order.push("watch");
        return () => {};
      },
    });
    t.runner.start();
    await waitFor(() => order.includes("watch"));
    expect(order).toEqual(["fetch", "watch"]);
    t.runner.stop();
  });

  it("tries again when loading history fails", async () => {
    let attempts = 0;
    const t = setup({
      fetchCandles: async () => {
        attempts++;
        if (attempts === 1) throw new Error("not connected");
        return HISTORY;
      },
    });
    t.runner.start();
    await waitFor(() => t.isWatching());
    expect(attempts).toBe(2);
    t.runner.stop();
  });

  it("stops watching when it is stopped", async () => {
    const t = setup();
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.runner.stop();
    expect(t.unwatch).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one strategy crashes", async () => {
    const throwing: Strategy = {
      id: "throwing",
      evaluate: () => {
        throw new Error("boom");
      },
    };
    const log = vi.fn();
    const t = setup({ strategies: [throwing, always], log });
    t.runner.start();
    await waitFor(() => t.isWatching());
    t.tick(185);
    t.tick(240);
    await waitFor(() => t.published.length === 1);
    expect(t.published[0]!.candidate.strategy).toBe("always");
    expect(log).toHaveBeenCalled();
    t.runner.stop();
  });
});