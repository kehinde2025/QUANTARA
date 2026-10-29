import { describe, expect, it } from "vitest";
import { interpretContract } from "./contractState.js";

describe("interpretContract", () => {
  it("reports a running contract as open", () => {
    expect(interpretContract({ is_sold: 0, is_expired: 0, status: "open", buy_price: "1.00" })).toEqual({
      state: "open",
    });
  });

  it("does not call an expired contract settled until Deriv says it was sold", () => {
    // Real: the first message after expiry had is_expired 1, is_sold 0 and status "open".
    const reading = interpretContract({
      is_expired: 1,
      is_sold: 0,
      status: "open",
      buy_price: "1.00",
      bid_price: "1.92",
      profit: "0.92",
    });
    expect(reading).toEqual({ state: "awaiting_settlement" });
  });

  it("settles a win from a real reply", () => {
    // Real: second demo trade.
    const reading = interpretContract({
      is_expired: 1,
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.92",
    });
    expect(reading.state).toBe("settled");
    if (reading.state === "settled") {
      expect(reading.outcome).toBe("win");
      expect(reading.profit.equals("0.92")).toBe(true);
      expect(reading.buyPrice.equals("1")).toBe(true);
      expect(reading.sellPrice.equals("1.92")).toBe(true);
    }
  });

  it("settles a loss", () => {
    const reading = interpretContract({
      is_expired: 1,
      is_sold: 1,
      status: "lost",
      buy_price: "1.00",
      sell_price: "0.00",
      profit: "-1.00",
    });
    expect(reading.state).toBe("settled");
    if (reading.state === "settled") {
      expect(reading.outcome).toBe("loss");
      expect(reading.profit.equals("-1")).toBe(true);
    }
  });

  it("settles a contract that returned exactly the stake as breakeven", () => {
    const reading = interpretContract({ is_sold: 1, buy_price: "1.00", sell_price: "1.00", profit: "0.00" });
    expect(reading.state === "settled" && reading.outcome).toBe("breakeven");
  });

  it("refuses figures that do not add up", () => {
    const reading = interpretContract({
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.50",
    });
    expect(reading.state).toBe("inconsistent");
  });

  it("refuses a status that contradicts the profit", () => {
    const wonButLost = interpretContract({
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "0.00",
      profit: "-1.00",
    });
    expect(wonButLost.state).toBe("inconsistent");
    const lostButWon = interpretContract({
      is_sold: 1,
      status: "lost",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.92",
    });
    expect(lostButWon.state).toBe("inconsistent");
  });

  it("refuses a sold contract with a missing price", () => {
    expect(interpretContract({ is_sold: 1, buy_price: "1.00", profit: "0.92" }).state).toBe("inconsistent");
    expect(interpretContract({ is_sold: 1 }).state).toBe("inconsistent");
  });
});