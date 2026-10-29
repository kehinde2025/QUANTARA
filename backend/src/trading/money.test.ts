import { describe, expect, it } from "vitest";
import { Decimal, fromDeriv, sameAmount, toDb } from "./money.js";

describe("money", () => {
  it("reads Deriv amounts given as text or as numbers", () => {
    expect(fromDeriv("1.00")?.equals(1)).toBe(true);
    expect(fromDeriv("-1.00")?.equals(-1)).toBe(true);
    expect(fromDeriv(1.92)?.equals("1.92")).toBe(true);
    expect(fromDeriv(0)?.equals(0)).toBe(true);
  });

  it("refuses anything that is not a plain amount", () => {
    for (const junk of [undefined, null, "", " ", "abc", "1.2.3", "1e5", NaN, Infinity, {}, [], true]) {
      expect(fromDeriv(junk)).toBeNull();
    }
  });

  it("adds exactly, unlike ordinary numbers", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(new Decimal("0.1").plus("0.2").equals("0.3")).toBe(true);
  });

  it("writes amounts with 8 decimals for the database", () => {
    expect(toDb(new Decimal("0.92"))).toBe("0.92000000");
    expect(toDb(new Decimal("-1"))).toBe("-1.00000000");
  });

  it("treats amounts within half a cent as the same", () => {
    expect(sameAmount(new Decimal("0.92"), new Decimal("0.9201"))).toBe(true);
    expect(sameAmount(new Decimal("0.92"), new Decimal("0.93"))).toBe(false);
  });
});