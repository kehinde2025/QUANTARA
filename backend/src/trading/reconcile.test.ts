import { describe, expect, it } from "vitest";
import { Decimal } from "./money.js";
import { PROFIT_TABLE_PAGE, matchPurchase, parsePortfolio, parseProfitTable } from "./reconcile.js";
import type { Candidate, IntentSummary } from "./reconcile.js";

// Our clock said "sent" one second before Deriv's purchase time.
const SENT = 1792053833_000;

const intent: IntentSummary = {
  symbol: "R_100",
  contractType: "CALL",
  stake: new Decimal("1"),
  askPrice: new Decimal("1"),
  purchaseSentAtMs: SENT,
};

// The real demo purchase.
const real: Candidate = {
  derivContractId: 17000299659,
  transactionId: 32518140359,
  buyPrice: new Decimal("1"),
  purchaseTimeMs: 1792053834_000,
  shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
  symbol: null,
  contractType: null,
  payout: new Decimal("1.92"),
};

const opts = (over: Partial<{ nowMs: number; notPurchasedAfterMs: number; linked: Set<number> }> = {}) => ({
  nowMs: SENT + 200_000,
  notPurchasedAfterMs: 120_000,
  linked: new Set<number>(),
  ...over,
});

describe("matchPurchase", () => {
  it("finds the one contract that matches", () => {
    const result = matchPurchase(intent, [real], opts());
    expect(result.kind).toBe("found");
    if (result.kind === "found") expect(result.candidate.derivContractId).toBe(17000299659);
  });

  it("does not mix up markets whose names start the same way", () => {
    const other = { ...real, derivContractId: 1, shortcode: "CALL_R_10_1.92_1792053834_5T_S0P_0" };
    expect(matchPurchase(intent, [other], opts()).kind).toBe("not_found");
    const intentR10 = { ...intent, symbol: "R_10" };
    expect(matchPurchase(intentR10, [real], opts()).kind).toBe("not_found");
  });

  it("ignores a different contract type or a different price", () => {
    const put = { ...real, shortcode: "PUT_R_100_1.92_1792053834_5T_S0P_0" };
    const pricey = { ...real, buyPrice: new Decimal("2") };
    expect(matchPurchase(intent, [put, pricey], opts()).kind).toBe("not_found");
  });

  it("ignores purchases made long before the send or after now", () => {
    const early = { ...real, purchaseTimeMs: SENT - 60_000 };
    const late = { ...real, derivContractId: 2, purchaseTimeMs: SENT + 500_000 };
    expect(matchPurchase(intent, [early, late], opts()).kind).toBe("not_found");
  });

  it("waits before it says nothing was bought, then says so", () => {
    expect(matchPurchase(intent, [], opts({ nowMs: SENT + 60_000 })).kind).toBe("too_early");
    expect(matchPurchase(intent, [], opts({ nowMs: SENT + 130_000 })).kind).toBe("not_found");
  });

  it("finds a purchase straight away, without waiting", () => {
    expect(matchPurchase(intent, [real], opts({ nowMs: SENT + 5_000 })).kind).toBe("found");
  });

  it("calls two matches ambiguous", () => {
    const twin = { ...real, derivContractId: 17000299660, transactionId: 32518140360 };
    expect(matchPurchase(intent, [real, twin], opts())).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("leaves out contracts that already belong to another attempt", () => {
    expect(matchPurchase(intent, [real], opts({ linked: new Set([17000299659]) })).kind).toBe("not_found");
  });

  it("never says 'not found' when a matching contract has no purchase time", () => {
    const noTime = { ...real, purchaseTimeMs: null };
    expect(matchPurchase(intent, [noTime], opts()).kind).toBe("ambiguous");
  });
});

describe("reading Deriv's lists", () => {
  const portfolioReply = {
    msg_type: "portfolio",
    portfolio: {
      contracts: [
        {
          contract_id: 17000299659,
          transaction_id: 32518140359,
          buy_price: 1,
          purchase_time: 1792053834,
          shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
          payout: "1.92",
          app_id: 12345,
        },
      ],
    },
  };

  it("reads open positions", () => {
    const list = parsePortfolio(portfolioReply)!;
    expect(list).toHaveLength(1);
    expect(list[0]!.derivContractId).toBe(17000299659);
    expect(list[0]!.transactionId).toBe(32518140359);
    expect(list[0]!.buyPrice.equals("1")).toBe(true);
    expect(list[0]!.purchaseTimeMs).toBe(1792053834_000);
    expect(list[0]!.shortcode).toBe("CALL_R_100_1.92_1792053834_5T_S0P_0");
  });

  it("refuses to read a reply that is incomplete or broken", () => {
    expect(parsePortfolio({ error: { code: "x" } })).toBeNull();
    expect(parsePortfolio({ msg_type: "portfolio" })).toBeNull();
    expect(parsePortfolio({ portfolio: {} })).toBeNull();
    expect(parsePortfolio({ portfolio: { contracts: [{ buy_price: 1 }] } })).toBeNull();
    expect(parsePortfolio({ portfolio: { contracts: [{ contract_id: 1, buy_price: "abc" }] } })).toBeNull();
  });

  it("reads closed contracts and refuses a full page that might hide older ones", () => {
    const one = { contract_id: 5, buy_price: "1.00", purchase_time: 1792053834 };
    expect(parseProfitTable({ profit_table: { count: 1, transactions: [one] } })).toHaveLength(1);
    const full = Array.from({ length: PROFIT_TABLE_PAGE }, (_, i) => ({ ...one, contract_id: i + 1 }));
    expect(parseProfitTable({ profit_table: { count: PROFIT_TABLE_PAGE, transactions: full } })).toBeNull();
    expect(parseProfitTable({ profit_table: {} })).toBeNull();
    expect(parseProfitTable({ error: {} })).toBeNull();
  });

  it("matches by market and type when a contract has no shortcode", () => {
    const [c] = parsePortfolio({
      portfolio: {
        contracts: [
          {
            contract_id: 5,
            buy_price: "1.00",
            purchase_time: 1792053834,
            underlying_symbol: "R_100",
            contract_type: "CALL",
          },
        ],
      },
    })!;
    expect(c!.shortcode).toBeNull();
    expect(c!.transactionId).toBeNull();
    expect(matchPurchase(intent, [c!], opts()).kind).toBe("found");
  });
});