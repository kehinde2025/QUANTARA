import type { Decimal } from "decimal.js";
import { fromDeriv, sameAmount } from "./money.js";

export type ContractReading =
  | { state: "open" }
  // The expiry time has passed but Deriv has not marked the contract sold yet.
  // This is NOT settled.
  | { state: "awaiting_settlement" }
  | {
      state: "settled";
      outcome: "win" | "loss" | "breakeven";
      buyPrice: Decimal;
      sellPrice: Decimal;
      profit: Decimal;
    }
  // Deriv's figures contradict each other. Do not book anything; investigate.
  | { state: "inconsistent"; reason: string };

const flag = (value: unknown) => Number(value) === 1;

// Reads a Deriv open-contract message. A contract is settled only when Deriv
// says it was sold, and the figures must agree with each other.
export function interpretContract(c: Record<string, unknown>): ContractReading {
  if (!flag(c.is_sold)) {
    return flag(c.is_expired) ? { state: "awaiting_settlement" } : { state: "open" };
  }

  const buyPrice = fromDeriv(c.buy_price);
  const sellPrice = fromDeriv(c.sell_price);
  const profit = fromDeriv(c.profit);
  if (!buyPrice || !sellPrice || !profit) {
    return { state: "inconsistent", reason: "a settled contract is missing a price field" };
  }
  if (!sameAmount(sellPrice.minus(buyPrice), profit)) {
    return { state: "inconsistent", reason: "profit does not match sell price minus buy price" };
  }
  if (c.status === "won" && !profit.gt(0)) {
    return { state: "inconsistent", reason: "marked won but profit is not positive" };
  }
  if (c.status === "lost" && profit.gt(0)) {
    return { state: "inconsistent", reason: "marked lost but profit is positive" };
  }

  const outcome = profit.gt(0) ? "win" : profit.lt(0) ? "loss" : "breakeven";
  return { state: "settled", outcome, buyPrice, sellPrice, profit };
}