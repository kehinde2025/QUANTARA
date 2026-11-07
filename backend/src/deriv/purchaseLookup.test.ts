import { describe, expect, it } from "vitest";
import type { Reply } from "./accountConnection.js";
import { createPurchaseLookup, mergeCandidates, parsePortfolio, parseStatement } from "./purchaseLookup.js";

const SHORTCODE = "CALL_R_100_1.92_1792053834_5T_S0P_0";

const portfolioReply = (over: Record<string, unknown> = {}): Reply => ({
  msg_type: "portfolio",
  portfolio: {
    contracts: [
      {
        contract_id: 17000299659,
        buy_price: 1,
        purchase_time: 1792053834,
        transaction_id: 32518140359,
        shortcode: SHORTCODE,
        contract_type: "CALL",
        symbol: "R_100",
        currency: "USD",
        payout: 1.92,
        ...over,
      },
    ],
  },
});

const statementReply = (items: Record<string, unknown>[] = []): Reply => ({
  msg_type: "statement",
  statement: {
    count: items.length,
    transactions: items.length
      ? items
      : [
          {
            action_type: "buy",
            amount: -1,
            balance_after: 14515.11,
            contract_id: 17000299659,
            transaction_id: 32518140359,
            transaction_time: 1792053834,
            shortcode: SHORTCODE,
            payout: 1.92,
          },
        ],
  },
});

describe("parsePortfolio", () => {
  it("reads open contracts", () => {
    const [c] = parsePortfolio(portfolioReply())!;
    expect(c!.derivContractId).toBe(17000299659);
    expect(c!.derivTransactionId).toBe(32518140359);
    expect(c!.buyPrice.equals("1")).toBe(true);
    expect(c!.purchaseTime.getTime()).toBe(1792053834 * 1000);
    expect(c!.shortcode).toBe(SHORTCODE);
    expect(c!.contractType).toBe("CALL");
    expect(c!.symbol).toBe("R_100");
  });
});

describe("parseStatement", () => {
  it("reads purchases, takes the price paid from a negative amount and skips sales", () => {
        const buy = {
      action_type: "buy",
      amount: -1,
      contract_id: 17000299659,
      transaction_id: 32518140359,
      transaction_time: 1792053834,
      shortcode: SHORTCODE,
    };
    const sale = { action_type: "sell", amount: 1.92, contract_id: 1 };
    const candidates = parseStatement(statementReply([buy, sale]))!;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.buyPrice.equals("1")).toBe(true);
    expect(candidates[0]!.derivTransactionId).toBe(32518140359);
    expect(candidates[0]!.contractType).toBeNull();
  });
});

describe("mergeCandidates", () => {
  it("keeps one entry for a contract seen in both lists and fills in what is missing", () => {
    const open = parsePortfolio(portfolioReply({ transaction_id: undefined, shortcode: undefined }))!;
    const bought = parseStatement(statementReply())!;
    const merged = mergeCandidates(open, bought);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.derivTransactionId).toBe(32518140359);
    expect(merged[0]!.shortcode).toBe(SHORTCODE);
    expect(merged[0]!.contractType).toBe("CALL");
  });
});

describe("unreadable replies", () => {
  it("refuses a reply that is missing or partial", () => {
    expect(parsePortfolio({})).toBeNull();
    expect(parsePortfolio(portfolioReply({ contract_id: undefined }))).toBeNull();
    expect(parsePortfolio(portfolioReply({ buy_price: "abc" }))).toBeNull();
    expect(parseStatement({})).toBeNull();
    expect(parseStatement(statementReply([{ action_type: "buy", amount: -1 }]))).toBeNull();
    expect(
      parseStatement(
        statementReply([
          { action_type: "buy", amount: "abc", contract_id: 1, transaction_id: 2, transaction_time: 3 },
        ]),
      ),
    ).toBeNull();
  });
});

describe("createPurchaseLookup", () => {
  const since = 1792053000_000;
  const now = 1792053900_000;

  it("asks for open contracts and for every purchase in the window, then merges them", async () => {
    const requests: Record<string, unknown>[] = [];
    const lookup = createPurchaseLookup({
      request: async (payload) => {
        requests.push(payload);
        return payload.portfolio ? portfolioReply() : statementReply();
      },
    });
    const result = await lookup(since, now);
    expect(requests).toContainEqual({ portfolio: 1 });
    expect(requests).toContainEqual({
      statement: 1,
      action_type: "buy",
      date_from: Math.floor(since / 1000),
      date_to: Math.ceil(now / 1000) + 60,
      description: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidates).toHaveLength(1);
  });

  it("gives no answer when a request fails or a reply is an error or unreadable", async () => {
    const failing = createPurchaseLookup({
      request: async () => {
        throw new Error("timeout");
      },
    });
    expect(await failing(since, now)).toEqual({ ok: false, reason: "request_failed" });

    const errored = createPurchaseLookup({
      request: async (payload) =>
        payload.portfolio ? { error: { code: "SomeError" } } : statementReply(),
    });
    expect(await errored(since, now)).toEqual({ ok: false, reason: "deriv_error" });

    const unreadable = createPurchaseLookup({
      request: async (payload) => (payload.portfolio ? { msg_type: "portfolio" } : statementReply()),
    });
    expect(await unreadable(since, now)).toEqual({ ok: false, reason: "unreadable_reply" });
  });
});