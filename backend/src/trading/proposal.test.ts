import { describe, expect, it } from "vitest";
import type { ContractTypeSummary } from "../market/contracts.js";
import { Decimal } from "./money.js";
import { buildProposalRequest, parseDurationText, validateDuration, validateProposal } from "./proposal.js";

const request = buildProposalRequest({
  symbol: "R_100",
  contractType: "CALL",
  stake: "1.00",
  currency: "USD",
  duration: 5,
  durationUnit: "t",
});

// Real quote from a demo account (long text fields trimmed).
const reply = {
  echo_req: {
    proposal: 1,
    contract_type: "CALL",
    underlying_symbol: "R_100",
    currency: "USD",
    amount: 1,
    basis: "stake",
    duration: 5,
    duration_unit: "t",
    req_id: 2,
  },
  msg_type: "proposal",
  proposal: {
    ask_price: 1,
    contract_details: { barrier: "649.61" },
    date_expiry: 1792053592,
    date_start: 1792053582,
    id: "84955743-ef6e-43f6-a740-6cd4f07c5c1a",
    payout: 1.92,
    spot: 649.61,
    spot_time: 1792053582,
  },
  req_id: 2,
};

const ctx = { receivedAtMs: 1_000_000, nowMs: 1_001_000, maxAskPrice: new Decimal("1.00") };

const rise: ContractTypeSummary = {
  contractType: "CALL",
  category: "callput",
  sentiment: "up",
  barriers: 1,
  durations: [
    { expiryType: "daily", min: "1d", max: "365d" },
    { expiryType: "intraday", min: "15s", max: "1d" },
    { expiryType: "tick", min: "1t", max: "10t" },
  ],
  growthRates: null,
  lastDigits: null,
};

describe("buildProposalRequest", () => {
  it("builds exactly the request that worked live", () => {
    expect(request).toEqual({
      proposal: 1,
      contract_type: "CALL",
      underlying_symbol: "R_100",
      currency: "USD",
      amount: 1,
      basis: "stake",
      duration: 5,
      duration_unit: "t",
    });
  });
});

describe("parseDurationText", () => {
  it("reads durations such as 15s and 10t", () => {
    expect(parseDurationText("15s")).toEqual({ value: 15, unit: "s" });
    expect(parseDurationText("10t")).toEqual({ value: 10, unit: "t" });
    expect(parseDurationText("365d")).toEqual({ value: 365, unit: "d" });
  });

  it("refuses anything else", () => {
    expect(parseDurationText("")).toBeNull();
    expect(parseDurationText("10")).toBeNull();
    expect(parseDurationText("1.5h")).toBeNull();
    expect(parseDurationText("5x")).toBeNull();
  });
});

describe("validateDuration", () => {
  it("accepts ticks inside the listed range and refuses ticks outside it", () => {
    expect(validateDuration(rise, 5, "t")).toEqual({ ok: true });
    expect(validateDuration(rise, 10, "t")).toEqual({ ok: true });
    expect(validateDuration(rise, 11, "t")).toEqual({ ok: false, reason: "duration_out_of_range" });
  });

  it("compares seconds, minutes and hours as time", () => {
    expect(validateDuration(rise, 20, "s")).toEqual({ ok: true });
    expect(validateDuration(rise, 10, "s")).toEqual({ ok: false, reason: "duration_out_of_range" });
    expect(validateDuration(rise, 1, "m")).toEqual({ ok: true });
    expect(validateDuration(rise, 2, "h")).toEqual({ ok: true });
    expect(validateDuration(rise, 24, "h")).toEqual({ ok: true });
    expect(validateDuration(rise, 25, "h")).toEqual({ ok: false, reason: "duration_out_of_range" });
  });

  it("checks daily contracts against the daily range", () => {
    expect(validateDuration(rise, 1, "d")).toEqual({ ok: true });
    expect(validateDuration(rise, 365, "d")).toEqual({ ok: true });
    expect(validateDuration(rise, 366, "d")).toEqual({ ok: false, reason: "duration_out_of_range" });
  });

  it("refuses a contract Deriv does not list", () => {
    expect(validateDuration(undefined, 5, "t")).toEqual({ ok: false, reason: "contract_not_listed" });
  });

  it("refuses a kind of duration Deriv does not offer for the contract", () => {
    const onlyTicks: ContractTypeSummary = {
      ...rise,
      durations: [{ expiryType: "tick", min: "1t", max: "10t" }],
    };
    expect(validateDuration(onlyTicks, 30, "s")).toEqual({ ok: false, reason: "duration_not_offered" });
  });

  it("refuses a duration that is not a positive whole number", () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(validateDuration(rise, bad, "t")).toEqual({ ok: false, reason: "invalid_duration" });
    }
  });
});

describe("validateProposal", () => {
  it("accepts the real quote", () => {
    const check = validateProposal(request, reply, ctx);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.id).toBe("84955743-ef6e-43f6-a740-6cd4f07c5c1a");
      expect(check.askPrice.equals("1")).toBe(true);
      expect(check.payout.equals("1.92")).toBe(true);
    }
  });

  it("refuses a price above the limit", () => {
    const check = validateProposal(request, reply, { ...ctx, maxAskPrice: new Decimal("0.99") });
    expect(check).toEqual({ ok: false, reason: "price_above_limit" });
  });

  it("refuses a quote that is too old", () => {
    const check = validateProposal(request, reply, { ...ctx, nowMs: 1_006_000 });
    expect(check).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses an answer to a different question", () => {
    const wrongDuration = { ...reply, echo_req: { ...reply.echo_req, duration: 6 } };
    expect(validateProposal(request, wrongDuration, ctx)).toEqual({ ok: false, reason: "mismatch" });
    const wrongType = { ...reply, echo_req: { ...reply.echo_req, contract_type: "PUT" } };
    expect(validateProposal(request, wrongType, ctx)).toEqual({ ok: false, reason: "mismatch" });
    const wrongStake = { ...reply, echo_req: { ...reply.echo_req, amount: 2 } };
    expect(validateProposal(request, wrongStake, ctx)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a quote without a proper id", () => {
    expect(validateProposal(request, { ...reply, proposal: { ...reply.proposal, id: "1" } }, ctx)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(validateProposal(request, { ...reply, proposal: undefined }, ctx)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("refuses a quote where a win would not pay more than the price", () => {
    const flat = { ...reply, proposal: { ...reply.proposal, payout: 1 } };
    expect(validateProposal(request, flat, ctx)).toEqual({ ok: false, reason: "no_profit_possible" });
  });

  it("refuses an error reply from Deriv", () => {
    const error = { error: { code: "ContractBuyValidationError", message: "no" }, echo_req: reply.echo_req };
    expect(validateProposal(request, error, ctx)).toEqual({ ok: false, reason: "deriv_error" });
  });

  it("refuses a missing, zero or unreadable price", () => {
    for (const price of [undefined, 0, "abc", -1]) {
      const bad = { ...reply, proposal: { ...reply.proposal, ask_price: price } };
      expect(validateProposal(request, bad, ctx)).toEqual({ ok: false, reason: "bad_price" });
    }
  });
});