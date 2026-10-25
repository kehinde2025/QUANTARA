import { describe, expect, it } from "vitest";
import { contractsForReply, summarizeContracts } from "./contracts.js";

// Entries copied from a real Deriv reply for R_100.
const CALL_DAILY = {
  barrier: "703.50",
  barriers: 1,
  contract_category: "callput",
  contract_type: "CALL",
  default_stake: 2,
  expiry_type: "daily",
  market: "synthetic_index",
  max_contract_duration: "365d",
  min_contract_duration: "1d",
  sentiment: "up",
  submarket: "random_index",
  underlying_symbol: "R_100",
};
const CALL_INTRADAY = { ...CALL_DAILY, expiry_type: "intraday", min_contract_duration: "15s", max_contract_duration: "1d" };
const CALL_TICK = { ...CALL_DAILY, expiry_type: "tick", min_contract_duration: "1t", max_contract_duration: "10t" };
const PUT_TICK = { ...CALL_TICK, contract_type: "PUT", sentiment: "down" };
const ACCU = {
  barriers: 2,
  contract_category: "accumulator",
  contract_type: "ACCU",
  default_stake: 2,
  expiry_type: "no_expiry",
  growth_rate_range: [0.01, 0.02, 0.03, 0.04, 0.05],
  growth_rate_barrier_offsets: [0.000612552024, 0.000572524639],
  high_barrier: "+0.00",
  low_barrier: "+0.00",
  market: "synthetic_index",
  max_contract_duration: "0",
  min_contract_duration: "0",
  sentiment: "low_vol",
  submarket: "random_index",
  underlying_symbol: "R_100",
};
const DIGITDIFF = {
  barriers: 1,
  contract_category: "digits",
  contract_type: "DIGITDIFF",
  default_stake: 2,
  expiry_type: "tick",
  last_digit_range: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  market: "synthetic_index",
  max_contract_duration: "10t",
  min_contract_duration: "1t",
  sentiment: "differ",
  submarket: "random_index",
  underlying_symbol: "R_100",
};

function summarize(available: unknown[]) {
  const reply = contractsForReply.parse({ contracts_for: { available } });
  return summarizeContracts(reply.contracts_for.available);
}

describe("summarizeContracts", () => {
  it("merges the separate Rise entries into one type with all its duration ranges", () => {
    const result = summarize([CALL_DAILY, CALL_INTRADAY, CALL_TICK]);
    expect(result).toHaveLength(1);
    expect(result[0]!.contractType).toBe("CALL");
    expect(result[0]!.category).toBe("callput");
    expect(result[0]!.sentiment).toBe("up");
    expect(result[0]!.durations).toHaveLength(3);
    expect(result[0]!.durations).toContainEqual({ expiryType: "tick", min: "1t", max: "10t" });
    expect(result[0]!.durations).toContainEqual({ expiryType: "intraday", min: "15s", max: "1d" });
    expect(result[0]!.durations).toContainEqual({ expiryType: "daily", min: "1d", max: "365d" });
  });

  it("keeps the accumulator growth rates exactly as Deriv gave them", () => {
    const [accu] = summarize([ACCU]);
    expect(accu!.growthRates).toEqual([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(accu!.durations).toEqual([{ expiryType: "no_expiry", min: "0", max: "0" }]);
    expect(accu!.lastDigits).toBeNull();
  });

  it("keeps the digit range for digit contracts", () => {
    const [digit] = summarize([DIGITDIFF]);
    expect(digit!.category).toBe("digits");
    expect(digit!.lastDigits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(digit!.durations).toEqual([{ expiryType: "tick", min: "1t", max: "10t" }]);
    expect(digit!.growthRates).toBeNull();
  });

  it("tolerates an entry with only a contract type", () => {
    const [bare] = summarize([{ contract_type: "RUNHIGH" }]);
    expect(bare).toEqual({
      contractType: "RUNHIGH",
      category: "other",
      sentiment: null,
      barriers: null,
      durations: [],
      growthRates: null,
      lastDigits: null,
    });
  });

  it("returns an empty list when Deriv lists nothing", () => {
    expect(summarize([])).toEqual([]);
  });

  it("rejects a reply that has no list of contracts", () => {
    expect(contractsForReply.safeParse({ contracts_for: {} }).success).toBe(false);
    expect(contractsForReply.safeParse({}).success).toBe(false);
  });

  it("sorts by category, then by contract type", () => {
    const result = summarize([DIGITDIFF, PUT_TICK, ACCU, CALL_TICK]);
    expect(result.map((c) => c.contractType)).toEqual(["ACCU", "CALL", "PUT", "DIGITDIFF"]);
  });
});