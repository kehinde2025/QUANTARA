import { describe, expect, it } from "vitest";
import { isDefinitelyNotPurchased, parseBuyReply, parseOpenContract } from "./derivReplies.js";

// Real buy reply from a demo account (long text trimmed).
const realBuy = {
  buy: {
    balance_after: 14515.11,
    buy_price: 1,
    contract_id: 17000299659,
    payout: 1.92,
    purchase_time: 1792053834,
    shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
    start_time: 1792053834,
    transaction_id: 32518140359,
  },
  echo_req: { buy: "ff3cf2fd-333e-44ab-a1a0-db033242c39a", price: 1, req_id: 3 },
  msg_type: "buy",
  req_id: 3,
};

describe("parseBuyReply", () => {
  it("reads the real buy reply", () => {
    const result = parseBuyReply(realBuy);
    expect(result.kind).toBe("purchased");
    if (result.kind === "purchased") {
      expect(result.purchase.derivContractId).toBe(17000299659);
      expect(result.purchase.derivTransactionId).toBe(32518140359);
      expect(result.purchase.buyPrice.equals("1")).toBe(true);
      expect(result.purchase.payout?.equals("1.92")).toBe(true);
      expect(result.purchase.openedAt.getTime()).toBe(1792053834 * 1000);
    }
  });

  it("treats a known refusal code as definitely not bought", () => {
    const result = parseBuyReply({ error: { code: "InputValidationFailed", message: "no" } });
    expect(result).toEqual({ kind: "error", code: "InputValidationFailed", definitelyNotPurchased: true });
  });

  it("treats an unknown error code as uncertain, not as a refusal", () => {
    const result = parseBuyReply({ error: { code: "InternalServerError", message: "oops" } });
    expect(result).toEqual({ kind: "error", code: "InternalServerError", definitelyNotPurchased: false });
    expect(isDefinitelyNotPurchased("SomethingNew")).toBe(false);
    const noCode = parseBuyReply({ error: {} });
    expect(noCode).toEqual({ kind: "error", code: "unknown", definitelyNotPurchased: false });
  });

  it("treats a reply that is neither a purchase nor an error as malformed", () => {
    expect(parseBuyReply({ msg_type: "buy" })).toEqual({ kind: "malformed" });
    expect(parseBuyReply({})).toEqual({ kind: "malformed" });
  });

  it("treats a purchase without a contract id as malformed", () => {
    const { contract_id: _unused, ...withoutId } = realBuy.buy;
    expect(parseBuyReply({ buy: withoutId })).toEqual({ kind: "malformed" });
  });

  it("treats a missing, zero or unreadable price as malformed", () => {
    for (const price of [undefined, 0, "abc", -1]) {
      expect(parseBuyReply({ buy: { ...realBuy.buy, buy_price: price } })).toEqual({ kind: "malformed" });
    }
  });
});

describe("parseOpenContract", () => {
  it("returns the contract from an open-contract message", () => {
    const contract = { contract_id: 55, is_sold: 0 };
    expect(parseOpenContract({ msg_type: "proposal_open_contract", proposal_open_contract: contract })).toEqual(
      contract,
    );
  });

  it("returns nothing for any other message", () => {
    expect(parseOpenContract({ msg_type: "buy", buy: {} })).toBeNull();
    expect(parseOpenContract({ msg_type: "proposal_open_contract" })).toBeNull();
    expect(parseOpenContract({ msg_type: "proposal_open_contract", proposal_open_contract: "x" })).toBeNull();
  });
});