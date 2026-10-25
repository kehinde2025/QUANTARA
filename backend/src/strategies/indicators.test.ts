import { describe, expect, it } from "vitest";
import { ema, rsi } from "./indicators.js";

describe("ema", () => {
  it("starts with a simple average and then smooths", () => {
    // period 3: first value is (1+2+3)/3 = 2, weight is 0.5
    // next: 4*0.5 + 2*0.5 = 3, then 5*0.5 + 3*0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("gives nothing when there are fewer prices than the period", () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });

  it("rejects an invalid period", () => {
    expect(() => ema([1, 2, 3], 0)).toThrow();
    expect(() => ema([1, 2, 3], 1.5)).toThrow();
  });
});

describe("rsi", () => {
  it("matches a hand-worked example", () => {
    // period 2, prices 1,2,1,2: changes +1,-1,+1
    // first value: avg gain 0.5, avg loss 0.5 -> RS 1 -> 50
    // next: avg gain (0.5+1)/2 = 0.75, avg loss (0.5+0)/2 = 0.25 -> RS 3 -> 75
    const out = rsi([1, 2, 1, 2], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(50, 10);
    expect(out[3]).toBeCloseTo(75, 10);
  });

  it("is 100 when the price only rises and 0 when it only falls", () => {
    const up = rsi([1, 2, 3, 4], 2);
    expect(up[2]).toBeCloseTo(100, 10);
    expect(up[3]).toBeCloseTo(100, 10);
    const down = rsi([4, 3, 2, 1], 2);
    expect(down[2]).toBeCloseTo(0, 10);
    expect(down[3]).toBeCloseTo(0, 10);
  });

  it("is 50 when the price does not move", () => {
    const flat = rsi([5, 5, 5, 5], 2);
    expect(flat[2]).toBeCloseTo(50, 10);
    expect(flat[3]).toBeCloseTo(50, 10);
  });

  it("gives nothing without enough prices", () => {
    expect(rsi([1, 2], 2)).toEqual([null, null]);
  });
});