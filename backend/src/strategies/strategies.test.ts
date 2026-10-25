import { describe, expect, it } from "vitest";
import { createEmaCross } from "./emaCross.js";
import { createRsiReversal } from "./rsiReversal.js";
import type { Candle } from "./types.js";

// Builds candles whose open, high, low and close are all the same price.
const candles = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({ epoch: 1000 + i * 60, open: close, high: close, low: close, close }));

describe("EMA cross (fast 2, slow 3)", () => {
  const strategy = createEmaCross({ fast: 2, slow: 3 });

  it("gives a rise idea when the fast average crosses above the slow one", () => {
    // fast 5.6667 against slow 5.5 on the last candle, equal one candle earlier
    const signal = strategy.evaluate(candles([5, 5, 5, 5, 6]));
    expect(signal?.strategy).toBe("ema_cross");
    expect(signal?.direction).toBe("rise");
    expect(signal?.contractType).toBe("CALL");
    expect(signal?.details.fast).toBeCloseTo(5.6667, 3);
    expect(signal?.details.slow).toBeCloseTo(5.5, 3);
  });

  it("gives a fall idea when the fast average crosses below the slow one", () => {
    const signal = strategy.evaluate(candles([5, 5, 5, 5, 4]));
    expect(signal?.direction).toBe("fall");
    expect(signal?.contractType).toBe("PUT");
  });

  it("does not repeat the idea on the candle after a cross", () => {
    expect(strategy.evaluate(candles([5, 5, 5, 5, 6, 7]))).toBeNull();
  });

  it("gives nothing when the price is flat", () => {
    expect(strategy.evaluate(candles([5, 5, 5, 5, 5]))).toBeNull();
  });

  it("gives nothing without enough candles", () => {
    expect(strategy.evaluate(candles([5, 5, 5]))).toBeNull();
  });

  it("rejects a bad setup", () => {
    expect(() => createEmaCross({ fast: 3, slow: 3 })).toThrow();
    expect(() => createEmaCross({ fast: 5, slow: 2 })).toThrow();
    expect(() => createEmaCross({ fast: 2.5, slow: 4 })).toThrow();
    expect(() => createEmaCross({ fast: 0, slow: 4 })).toThrow();
  });
});

describe("RSI reversal (period 2, lines 30 and 70)", () => {
  const strategy = createRsiReversal({ period: 2, oversold: 30, overbought: 70 });

  it("gives a rise idea when RSI climbs back above the oversold line", () => {
    // RSI is 0, then 50
    const signal = strategy.evaluate(candles([10, 9, 8, 9]));
    expect(signal?.strategy).toBe("rsi_reversal");
    expect(signal?.direction).toBe("rise");
    expect(signal?.contractType).toBe("CALL");
    expect(signal?.details.prevRsi).toBeCloseTo(0, 6);
    expect(signal?.details.rsi).toBeCloseTo(50, 6);
  });

  it("gives a fall idea when RSI drops back below the overbought line", () => {
    // RSI is 100, then 50
    const signal = strategy.evaluate(candles([8, 9, 10, 9]));
    expect(signal?.direction).toBe("fall");
    expect(signal?.contractType).toBe("PUT");
  });

  it("gives nothing when RSI stays on one side", () => {
    expect(strategy.evaluate(candles([10, 9, 8, 7]))).toBeNull();
  });

  it("gives nothing without enough candles", () => {
    expect(strategy.evaluate(candles([10, 9, 8]))).toBeNull();
  });

  it("rejects a bad setup", () => {
    expect(() => createRsiReversal({ period: 1, oversold: 30, overbought: 70 })).toThrow();
    expect(() => createRsiReversal({ period: 14, oversold: 70, overbought: 30 })).toThrow();
    expect(() => createRsiReversal({ period: 14, oversold: 30, overbought: 100 })).toThrow();
    expect(() => createRsiReversal({ period: 14, oversold: 0, overbought: 70 })).toThrow();
  });
});