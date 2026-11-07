import { describe, expect, it } from "vitest";
import { Decimal } from "./money.js";
import { matchPurchase } from "./reconcile.js";
import type { Candidate, IntentFacts } from "./reconcile.js";

const SENT = new Date(1792053834 * 1000);

const intent: IntentFacts = {
  symbol: "R_100",
  contractType: "CALL",
  expectedPrice: new Decimal("1"),
  purchaseSentAt: SENT,
};

// The real demo purchase.
const real: Candidate = {
  derivContractId: 17000299659,
  derivTransactionId: 32518140359,
  buyPrice: new Decimal("1"),
  purchaseTime: SENT,
  shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
  contractType: null,
  symbol: null,
};

const opts = (over: Partial<Parameters<typeof matchPurchase>[2]> = {}) => ({
  nowMs: SENT.getTime() + 200_000,
  isLinked: () => false,
  ...over,
});

describe("matchPurchase", () => {
  it("finds the purchase that matches", () => {
    const result = matchPurchase(intent, [real], opts());
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.candidate.derivContractId).toBe(17000299659);
      expect(result.candidate.derivTransactionId).toBe(32518140359);
    }
  });

  it("ignores a purchase that already belongs to another attempt", () => {
    const result = matchPurchase(intent, [real], opts({ isLinked: (id) => id === real.derivContractId }));
    expect(result).toEqual({ kind: "not_found" });
  });

  it("keeps one market apart from another with a similar name", () => {
    const r10: Candidate = { ...real, shortcode: "CALL_R_10_1.92_1792053834_5T_S0P_0" };
    expect(matchPurchase(intent, [r10], opts())).toEqual({ kind: "not_found" });
    expect(matchPurchase({ ...intent, symbol: "R_10" }, [real], opts())).toEqual({ kind: "not_found" });
  });

  it("ignores another contract type, another price and another time", () => {
    const put: Candidate = { ...real, shortcode: "PUT_R_100_1.92_1792053834_5T_S0P_0" };
    const dear: Candidate = { ...real, buyPrice: new Decimal("2") };
    const early: Candidate = { ...real, purchaseTime: new Date(SENT.getTime() - 10 * 60_000) };
    const late: Candidate = { ...real, purchaseTime: new Date(SENT.getTime() + 200_000 + 60_000) };
    for (const other of [put, dear, early, late]) {
      expect(matchPurchase(intent, [other], opts())).toEqual({ kind: "not_found" });
    }
  });

  it("will not choose between several possible purchases", () => {
    const second: Candidate = { ...real, derivContractId: 17000299660, derivTransactionId: 32518140360 };
    expect(matchPurchase(intent, [real, second], opts())).toEqual({
      kind: "ambiguous",
      reason: "several_matches",
    });
  });

  it("asks for a person when the only match has no transaction number", () => {
    const noTx: Candidate = { ...real, derivTransactionId: null };
    expect(matchPurchase(intent, [noTx], opts())).toEqual({
      kind: "ambiguous",
      reason: "missing_transaction_id",
    });
  });

  it("waits two minutes before saying nothing was bought", () => {
    expect(matchPurchase(intent, [], opts({ nowMs: SENT.getTime() + 119_999 }))).toEqual({ kind: "too_early" });
    expect(matchPurchase(intent, [], opts({ nowMs: SENT.getTime() + 120_000 }))).toEqual({ kind: "not_found" });
  });

  it("uses the contract type and market fields when there is no shortcode", () => {
    const noShortcode: Candidate = { ...real, shortcode: null, contractType: "CALL", symbol: "R_100" };
    expect(matchPurchase(intent, [noShortcode], opts()).kind).toBe("found");
    const wrong: Candidate = { ...noShortcode, symbol: "R_50" };
    expect(matchPurchase(intent, [wrong], opts())).toEqual({ kind: "not_found" });
  });

  it("treats a purchase it cannot identify as a possible match, never as nothing", () => {
    const unknown: Candidate = { ...real, shortcode: null, contractType: null, symbol: null };
    expect(matchPurchase(intent, [unknown], opts())).toEqual({
      kind: "ambiguous",
      reason: "unidentifiable_candidate",
    });
  });
});