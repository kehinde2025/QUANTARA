import { describe, expect, it } from "vitest";
import { RequestError } from "../deriv/accountConnection.js";
import type { Reply } from "../deriv/accountConnection.js";
import type { ContractTypeSummary } from "../market/contracts.js";
import type { SignalView } from "../signals/signalService.js";
import { TradingEngine } from "./engine.js";
import type { EngineDeps, ExecuteRequest, RiskDecision } from "./engine.js";
import { assertTransition } from "./intentStates.js";
import type { IntentState } from "./intentStates.js";
import { Decimal } from "./money.js";
import type { Contract } from "./tradeStore.js";

const USER = "user-1";
const ACCOUNT = "DOT0000001";

// ---- Real reply from our demo trade ----
const BUY_OK: Reply = {
  buy: {
    balance_after: 14515.11,
    buy_price: 1,
    contract_id: 17000299659,
    payout: 1.92,
    purchase_time: 1792053834,
    transaction_id: 32518140359,
  },
  msg_type: "buy",
};
const CONTRACT_ID = 17000299659;

const proposalReply = (payload: Record<string, unknown>, ask: number): Reply => ({
  echo_req: { ...payload, req_id: 2 },
  msg_type: "proposal",
  proposal: {
    ask_price: ask,
    payout: 1.92,
    id: "84955743-ef6e-43f6-a740-6cd4f07c5c1a",
    date_start: 1,
    date_expiry: 6,
    spot: 1,
  },
  req_id: 2,
});

const rise: ContractTypeSummary = {
  contractType: "CALL",
  category: "callput",
  sentiment: "up",
  barriers: 1,
  durations: [{ expiryType: "tick", min: "1t", max: "10t" }],
  growthRates: null,
  lastDigits: null,
};

const signalView = (): SignalView => ({
  id: "signal-1",
  strategy: "ema_cross",
  symbol: "R_100",
  direction: "rise",
  contractType: "CALL",
  timeframeSeconds: 60,
  reason: "test",
  details: {},
  status: "valid",
  createdAt: new Date(),
  expiresAt: new Date(),
});

const request = (over: Partial<ExecuteRequest> = {}): ExecuteRequest => ({
  userId: USER,
  accountId: ACCOUNT,
  accountType: "demo",
  signalId: "signal-1",
  stake: new Decimal("1"),
  currency: "USD",
  duration: 5,
  durationUnit: "t",
  ...over,
});

// ---- A fake store that follows the same state rules as the real one ----
class FakeStore {
  readonly intents = new Map<string, { id: string; state: IntentState; reason: string | null }>();
  readonly contractsByDerivId = new Map<number, Contract>();
  failConfirm = false;
  private readonly seen = new Set<string>();
  private readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  async createIntent(input: { signalId: string | null; accountId: string }) {
    const key = `${input.signalId}|${input.accountId}`;
    if (input.signalId && this.seen.has(key)) return { created: false as const };
    this.seen.add(key);
    const id = `intent-${this.intents.size + 1}`;
    this.intents.set(id, { id, state: "created", reason: null });
    this.log.push("create");
    return { created: true as const, intent: { id } };
  }

  async moveIntent(id: string, from: IntentState, to: IntentState, patch: { stateReason?: string | null } = {}) {
    assertTransition(from, to);
    const current = this.intents.get(id);
    if (!current || current.state !== from) throw new Error(`not in state ${from}`);
    current.state = to;
    current.reason = patch.stateReason ?? current.reason;
    this.log.push(`move:${to}`);
    return current;
  }

  async confirmPurchase(id: string, from: IntentState, purchase: { derivContractId: number }) {
    if (this.failConfirm) throw new Error("database is down");
    assertTransition(from, "purchase_confirmed");
    const current = this.intents.get(id)!;
    current.state = "purchase_confirmed";
    const contract = { id: "contract-1", intentId: id, derivContractId: purchase.derivContractId } as unknown as Contract;
    this.contractsByDerivId.set(purchase.derivContractId, contract);
    this.log.push("confirm");
    return { intent: current, contract };
  }

  async findContractByDerivId(_accountId: string, derivContractId: number) {
    return this.contractsByDerivId.get(derivContractId) ?? null;
  }

  async applyReading(_contractId: string, reading: { state: string }) {
    this.log.push(`reading:${reading.state}`);
    return {} as Contract;
  }
}

function setup() {
  const log: string[] = [];
  const store = new FakeStore(log);
  const requests: Record<string, unknown>[] = [];
  const watched: number[] = [];
  const unwatched: number[] = [];

  // Everything a test can change while the engine is running.
  const ctl = {
    now: 1_000_000,
    buying: true,
    connection: "open" as "open" | "closed",
    signalFirst: true,
    signalAfterQuote: true,
    advanceOnRecheck: 0,
    risk: { approved: true } as RiskDecision,
    contracts: (async () => [rise]) as () => Promise<ContractTypeSummary[]>,
    ask: 1,
    onProposal: (() => {}) as () => void,
    proposal: null as null | ((payload: Record<string, unknown>) => Promise<Reply>),
    buy: (async () => BUY_OK) as (payload: Record<string, unknown>) => Promise<Reply>,
  };
  let signalCalls = 0;

  const deps: EngineDeps = {
    userId: USER,
    accountId: ACCOUNT,
    store: store as unknown as EngineDeps["store"],
    buyingEnabled: () => ctl.buying,
    riskGate: async () => ctl.risk,
    getSignal: async () => {
      signalCalls++;
      if (signalCalls === 1) return ctl.signalFirst ? signalView() : null;
      ctl.now += ctl.advanceOnRecheck;
      return ctl.signalAfterQuote ? signalView() : null;
    },
    getContractTypes: () => ctl.contracts(),
    connection: {
      getStatus: () => ctl.connection,
      request: async (payload: Record<string, unknown>) => {
        requests.push(payload);
        if (payload.buy) {
          log.push("request:buy");
          return ctl.buy(payload);
        }
        log.push("request:proposal");
        ctl.onProposal();
        return ctl.proposal ? ctl.proposal(payload) : proposalReply(payload, ctl.ask);
      },
      watchContract: (id: number) => {
        watched.push(id);
      },
      unwatchContract: (id: number) => {
        unwatched.push(id);
      },
    },
    now: () => ctl.now,
    log: () => {},
  };

  const engine = new TradingEngine(deps);
  const buys = () => requests.filter((r) => r.buy);
  const lastState = () => [...store.intents.values()].pop()?.state;
  return { engine, store, log, requests, buys, watched, unwatched, ctl, lastState };
}

describe("checks that write nothing", () => {
  it("does nothing at all while buying is switched off", async () => {
    const t = setup();
    t.ctl.buying = false;
    expect(await t.engine.execute(request())).toEqual({ outcome: "disabled" });
    expect(t.log).toEqual([]);
    expect(t.requests).toHaveLength(0);
  });

  it("refuses real accounts", async () => {
    const t = setup();
    expect(await t.engine.execute(request({ accountType: "real" }))).toEqual({
      outcome: "refused",
      reason: "real_accounts_disabled",
    });
    expect(t.log).toEqual([]);
  });

  it("refuses a request for a different customer or account", async () => {
    const t = setup();
    expect(await t.engine.execute(request({ accountId: "DOT0000002" }))).toEqual({
      outcome: "refused",
      reason: "wrong_account",
    });
    expect(await t.engine.execute(request({ userId: "someone-else" }))).toEqual({
      outcome: "refused",
      reason: "wrong_account",
    });
    expect(t.log).toEqual([]);
  });

  it("refuses when the connection is not open", async () => {
    const t = setup();
    t.ctl.connection = "closed";
    expect(await t.engine.execute(request())).toEqual({ outcome: "refused", reason: "not_connected" });
    expect(t.log).toEqual([]);
  });

  it("refuses a signal that is expired or unknown", async () => {
    const t = setup();
    t.ctl.signalFirst = false;
    expect(await t.engine.execute(request())).toEqual({ outcome: "refused", reason: "signal_not_executable" });
    expect(t.log).toEqual([]);
  });
});

describe("before the price", () => {
  it("reports a repeat of the same signal as a duplicate and asks Deriv for nothing", async () => {
    const t = setup();
    await t.engine.execute(request());
    const before = t.requests.length;
    const second = await t.engine.execute(request());
    expect(second).toEqual({ outcome: "duplicate" });
    expect(t.requests.length).toBe(before);
  });

  it("rejects when the risk gate says no, without asking Deriv for a price", async () => {
    const t = setup();
    t.ctl.risk = { approved: false, reason: "daily_loss_limit" };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "risk_daily_loss_limit" });
    expect(t.lastState()).toBe("rejected");
    expect(t.requests).toHaveLength(0);
  });

  it("rejects a duration Deriv does not list, without asking for a price", async () => {
    const t = setup();
    const result = await t.engine.execute(request({ duration: 50 }));
    expect(result).toMatchObject({ outcome: "rejected", reason: "duration_duration_out_of_range" });
    expect(t.requests).toHaveLength(0);
  });

  it("fails safely when the contract list cannot be read", async () => {
    const t = setup();
    t.ctl.contracts = async () => {
      throw new Error("down");
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "failed", reason: "contract_list_unavailable" });
    expect(t.lastState()).toBe("failed");
    expect(t.requests).toHaveLength(0);
  });

  it("fails safely when the price request itself fails", async () => {
    const t = setup();
    t.ctl.proposal = async () => {
      throw new RequestError("timeout", true);
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "failed", reason: "proposal_request_failed" });
    expect(t.lastState()).toBe("failed");
    expect(t.buys()).toHaveLength(0);
  });

  it("rejects a quote that costs more than the stake and sends no buy", async () => {
    const t = setup();
    t.ctl.ask = 1.2;
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "proposal_price_above_limit" });
    expect(t.buys()).toHaveLength(0);
  });
});

describe("the purchase", () => {
  it("buys once, records the contract and starts following it", async () => {
    const t = setup();
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "purchased", contractId: "contract-1" });
    expect(t.log).toEqual([
      "create",
      "move:risk_approved",
      "move:proposal_obtained",
      "move:purchase_sent",
      "request:proposal",
      "request:buy",
      "confirm",
    ].sort((a, b) => 0) && [
      "create",
      "move:risk_approved",
      "request:proposal",
      "move:proposal_obtained",
      "move:purchase_sent",
      "request:buy",
      "confirm",
    ]);
    expect(t.buys()).toHaveLength(1);
    expect(t.buys()[0]).toEqual({ buy: "84955743-ef6e-43f6-a740-6cd4f07c5c1a", price: 1 });
    expect(t.watched).toEqual([CONTRACT_ID]);
  });

  it("records 'purchase sent' BEFORE it sends the buy", async () => {
    const t = setup();
    await t.engine.execute(request());
    expect(t.log.indexOf("move:purchase_sent")).toBeGreaterThan(-1);
    expect(t.log.indexOf("move:purchase_sent")).toBeLessThan(t.log.indexOf("request:buy"));
  });

  it("does not buy if the signal expired while waiting for the price", async () => {
    const t = setup();
    t.ctl.signalAfterQuote = false;
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "signal_expired_before_purchase" });
    expect(t.buys()).toHaveLength(0);
  });

  it("does not buy if buying is switched off after the price arrived", async () => {
    const t = setup();
    t.ctl.onProposal = () => {
      t.ctl.buying = false;
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "buying_switched_off" });
    expect(t.buys()).toHaveLength(0);
  });

  it("does not buy on a quote that has become too old", async () => {
    const t = setup();
    t.ctl.advanceOnRecheck = 6000;
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "quote_expired_before_purchase" });
    expect(t.buys()).toHaveLength(0);
  });

  it("does not buy if the risk gate changes its mind at the last look", async () => {
    const t = setup();
    t.ctl.onProposal = () => {
      t.ctl.risk = { approved: false, reason: "emergency_stop" };
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "risk_emergency_stop" });
    expect(t.buys()).toHaveLength(0);
  });
});

describe("when the purchase answer is lost or unclear", () => {
  it("calls it uncertain after a timeout and never sends the buy again", async () => {
    const t = setup();
    t.ctl.buy = async () => {
      throw new RequestError("timeout", true);
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "uncertain", reason: "no_answer_timeout" });
    expect(t.lastState()).toBe("purchase_uncertain");
    expect(t.buys()).toHaveLength(1);
    expect(t.watched).toEqual([]);
  });

  it("calls it uncertain when the connection drops during the buy", async () => {
    const t = setup();
    t.ctl.buy = async () => {
      throw new RequestError("connection_closed", true);
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "uncertain", reason: "no_answer_connection_closed" });
    expect(t.buys()).toHaveLength(1);
  });

  it("rejects, without doubt, a buy that was never sent", async () => {
    const t = setup();
    t.ctl.buy = async () => {
      throw new RequestError("not_connected", false);
    };
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "not_sent" });
    expect(t.lastState()).toBe("rejected");
  });

  it("rejects when Deriv clearly refuses with a known refusal code", async () => {
    const t = setup();
    t.ctl.buy = async () => ({ error: { code: "InputValidationFailed", message: "no" } });
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "rejected", reason: "deriv_InputValidationFailed" });
    expect(t.lastState()).toBe("rejected");
  });

  it("calls an unknown error code uncertain, not a refusal", async () => {
    const t = setup();
    t.ctl.buy = async () => ({ error: { code: "InternalServerError", message: "oops" } });
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "uncertain", reason: "deriv_error_InternalServerError" });
    expect(t.lastState()).toBe("purchase_uncertain");
  });

  it("calls an unreadable reply uncertain", async () => {
    const t = setup();
    t.ctl.buy = async () => ({ msg_type: "buy" });
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "uncertain", reason: "malformed_reply" });
  });

  it("stays uncertain, still marked sent, when Deriv bought but we could not record it", async () => {
    const t = setup();
    t.store.failConfirm = true;
    const result = await t.engine.execute(request());
    expect(result).toMatchObject({ outcome: "uncertain", reason: "recording_failed" });
    expect(t.lastState()).toBe("purchase_sent"); // the check against Deriv's records finds it
    expect(t.buys()).toHaveLength(1);
    expect(t.log).not.toContain("confirm");
  });
});

describe("following a contract", () => {
  async function bought() {
    const t = setup();
    await t.engine.execute(request());
    return t;
  }

  it("keeps an expired but unsold contract as awaiting settlement", async () => {
    const t = await bought();
    await t.engine.onContractUpdate({
      contract_id: CONTRACT_ID,
      is_expired: 1,
      is_sold: 0,
      status: "open",
      buy_price: "1.00",
    });
    expect(t.log[t.log.length - 1]).toBe("reading:awaiting_settlement");
    expect(t.unwatched).toEqual([]);
  });

  it("settles a sold contract with consistent figures and stops following it", async () => {
    const t = await bought();
    await t.engine.onContractUpdate({
      contract_id: CONTRACT_ID,
      is_expired: 1,
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.92",
    });
    expect(t.log[t.log.length - 1]).toBe("reading:settled");
    expect(t.unwatched).toEqual([CONTRACT_ID]);
  });

  it("ignores an update for a contract it does not know", async () => {
    const t = await bought();
    const before = t.log.length;
    await t.engine.onContractUpdate({ contract_id: 999, is_sold: 1 });
    expect(t.log.length).toBe(before);
  });

  it("flags contradictory figures and keeps following the contract", async () => {
    const t = await bought();
    await t.engine.onContractUpdate({
      contract_id: CONTRACT_ID,
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.10",
    });
    expect(t.log[t.log.length - 1]).toBe("reading:inconsistent");
    expect(t.unwatched).toEqual([]);
  });
});