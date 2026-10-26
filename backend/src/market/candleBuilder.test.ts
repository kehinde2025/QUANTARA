import { describe, expect, it } from "vitest";
import { CandleBuilder } from "./candleBuilder.js";
import type { Candle } from "../strategies/types.js";

const candle = (epoch: number, close: number): Candle => ({ epoch, open: close, high: close, low: close, close });

describe("CandleBuilder", () => {
  it("builds one candle from the ticks of one minute", () => {
    const b = new CandleBuilder(60);
    expect(b.addTick(60, 10)).toBeNull();
    expect(b.addTick(70, 12)).toBeNull();
    expect(b.addTick(80, 9)).toBeNull();
    expect(b.addTick(95, 11)).toBeNull();
    const closed = b.addTick(120, 20);
    expect(closed).toEqual({
      candle: { epoch: 60, open: 10, high: 12, low: 9, close: 11 },
      gapSeconds: 0,
    });
  });

  it("keeps finished candles in order", () => {
    const b = new CandleBuilder(60);
    b.addTick(60, 1);
    b.addTick(120, 2);
    b.addTick(180, 3);
    expect(b.closed().map((c) => c.epoch)).toEqual([60, 120]);
  });

  it("reports a gap and forgets older candles", () => {
    const b = new CandleBuilder(60);
    b.addTick(60, 1);
    b.addTick(120, 2); // closes minute 60
    const result = b.addTick(300, 3); // minutes 180 and 240 are missing
    expect(result?.candle.epoch).toBe(120);
    expect(result?.gapSeconds).toBe(120);
    expect(b.closed()).toEqual([]);
  });

  it("ignores ticks older than the minute being built", () => {
    const b = new CandleBuilder(60);
    b.addTick(130, 5);
    expect(b.addTick(70, 99)).toBeNull();
    const closed = b.addTick(190, 6);
    expect(closed?.candle.close).toBe(5);
    expect(closed?.candle.high).toBe(5);
  });

  it("continues a seeded candle that is still forming", () => {
    const b = new CandleBuilder(60);
    b.seed([candle(60, 1), candle(120, 2), candle(180, 3)]);
    expect(b.closed().map((c) => c.epoch)).toEqual([60, 120]);
    expect(b.addTick(185, 7)).toBeNull();
    const closed = b.addTick(240, 8);
    expect(closed?.candle.epoch).toBe(180);
    expect(closed?.candle.close).toBe(7);
    expect(closed?.candle.high).toBe(7);
    expect(closed?.gapSeconds).toBe(0);
    expect(b.closed().map((c) => c.epoch)).toEqual([60, 120, 180]);
  });

  it("keeps at most the allowed number of finished candles", () => {
    const b = new CandleBuilder(60, 3);
    for (let i = 1; i <= 7; i++) b.addTick(i * 60, i);
    expect(b.closed().map((c) => c.epoch)).toEqual([240, 300, 360]);
  });

  it("drops duplicate candles when seeding", () => {
    const b = new CandleBuilder(60);
    b.seed([candle(60, 1), candle(60, 1), candle(120, 2)]);
    expect(b.closed().map((c) => c.epoch)).toEqual([60]);
  });
});