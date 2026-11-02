import { describe, expect, it } from "vitest";
import { RequestError } from "../deriv/accountConnection.js";
import type { Reply } from "../deriv/accountConnection.js";
import { assertTransition } from "./intentStates.js";
import type { IntentState } from "./intentStates.js";
import { Reconciler } from "./reconciler.js";
import type { ReconcilerDeps } from "./reconciler.js";
import type { Contract, Intent } from "./tradeStore.js";

const ACCOUNT = "DOT0000001";
const SENT = 1792053833_000;

// The real demo purchase, as a contract entry.
const realEntry = {
  contract_id: 17000299659,
  transaction_id: 32518140359,
  buy_price: 1,
  purchase_time: 1792053834,
  shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
  payout: "1.92",
};

const portfolioReply = (contracts: unknown[]): Reply => ({ msg_type: "portfolio", portfolio: { contracts } });
const profitReply = (transactions: unknown[]): Reply => ({
  msg_type: "profit_table",
  profit_table: { count: transactions.length, transactions },
});

type Row = {
  id: string;
  accountId: string;
  state: IntentState;
  symbol: string;
  contractType: string;
  stake: string;
  askPrice: string | null;
  purchaseSentAt: Date | null;
};

class FakeStore {
  readonly rows: Row[];
  readonly moves: string[] = [];
  readonly confirmed: Array<{ id: string; from: IntentState; contractId: number }> = [];
  readonly linked = new Map<number, string>();

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  async findIntentsNeedingReconciliation(olderThan: Date) {
    return this.rows.filter(
      (r) =>
        r.state === "purchase_uncertain" ||
        (r.state === "purchase_sent" && r.purchaseSentAt !== null && r.purchaseSentAt < olderThan),
    ) as unknown as Intent[];
  }

  async moveIntent(id: string, from: IntentState, to: IntentState, patch: { stateReason?: string | null } = {}) {
    assertTransition(from, to);
    const row = this.rows.find((r) => r.id === id)!;
    if (row.state !== from) throw new Error(`not in state ${from}`);
    row.state = to;
    this.moves.push(`${id}:${from}->${to}:${patch.stateReason ?? ""}`);
    return row as unknown as Intent;
  }

  async confirmPurchase(id: string, from: IntentState, purchase: { derivContractId: number }) {
    assertTransition(from, "purchase_confirmed");
    const row = this.rows.find((r) => r.id === id)!;
    row.state = "purchase_confirmed";
    this.linked.set(purchase.derivContractId, id);
    this.confirmed.push({ id, from, contractId: purchase.derivContractId });
    return { intent: row as unknown as Intent, contract: {} as Contract };
  }

  async findContractByDerivId(_accountId: string, derivContractId: number) {
    return this.linked.has(derivContractId) ? ({} as Contract) : null;
  }
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "i1",
  accountId: ACCOUNT,
  state: "purchase_sent",
  symbol: "R_100",
  contractType: "CALL",
  stake: "1.00000000",
  askPrice: "1.00000000",
  purchaseSentAt: new Date(SENT),
  ...over,
});

function setup(rows: Row[], opts: { nowOffsetMs?: number } = {}) {
  const store = new FakeStore(rows);
  const requests: Array<Record<string, unknown>> = [];
  const watched: number[] = [];
  const ctl = {
    status: "open" as "open" | "closed",
    portfolio: (async () => portfolioReply([])) as () => Promise<Reply>,
    profit: (async () => profitReply([])) as () => Promise<Reply>,
  };
  const deps: ReconcilerDeps = {
    accountId: ACCOUNT,
    connection: {
      getStatus: () => ctl.status,
      request: async (payload: Record<string, unknown>) => {
        requests.push(payload);
        return payload.portfolio ? ctl.portfolio() : ctl.profit();
      },
      watchContract: (id: number) => {
        watched.push(id);
      },
    },
    store: store as unknown as ReconcilerDeps["store"],
    now: () => SENT + (opts.nowOffsetMs ?? 200_000),
    log: () => {},
  };
  return { reconciler: new Reconciler(deps), store, requests, watched, ctl };
}

describe("Reconciler", () => {
  it("confirms a purchase found in the open positions, even before the waiting time is over", async () => {
    const t = setup([row()], { nowOffsetMs: 60_000 });
    t.ctl.portfolio = async () => portfolioReply([realEntry]);
    const summary = await t.reconciler.reconcileOnce();
    expect(summary).toMatchObject({ checked: 1, confirmed: 1 });
    expect(t.store.confirmed).toEqual([{ id: "i1", from: "purchase_sent", contractId: 17000299659 }]);
    expect(t.watched).toEqual([17000299659]);
  });

  it("confirms a purchase found in the closed history", async () => {
    const t = setup([row()]);
    t.ctl.profit = async () => profitReply([{ ...realEntry, sell_price: 1.92, sell_time: 1792053844 }]);
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ confirmed: 1 });
    expect(t.watched).toEqual([17000299659]);
  });

  it("settles an attempt that was already marked uncertain", async () => {
    const t = setup([row({ state: "purchase_uncertain" })]);
    t.ctl.portfolio = async () => portfolioReply([realEntry]);
    await t.reconciler.reconcileOnce();
    expect(t.store.confirmed[0]).toMatchObject({ from: "purchase_uncertain" });
  });

  it("leaves an attempt alone while it is too recent, and asks Deriv nothing", async () => {
    const t = setup([row()], { nowOffsetMs: 10_000 });
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ checked: 0 });
    expect(t.requests).toHaveLength(0);
  });

  it("asks Deriv nothing when no attempt needs checking", async () => {
    const t = setup([row({ state: "purchase_confirmed" })]);
    await t.reconciler.reconcileOnce();
    expect(t.requests).toHaveLength(0);
  });

  it("does not say 'not bought' before the waiting time is over", async () => {
    const t = setup([row()], { nowOffsetMs: 60_000 });
    const summary = await t.reconciler.reconcileOnce();
    expect(summary).toMatchObject({ checked: 1, skipped: 1, failed: 0 });
    expect(t.store.moves).toEqual([]);
  });

  it("marks an attempt failed only after the waiting time, with both lists read and nothing found", async () => {
    const t = setup([row()]);
    const summary = await t.reconciler.reconcileOnce();
    expect(summary).toMatchObject({ failed: 1 });
    expect(t.store.moves).toEqual([
      "i1:purchase_sent->purchase_uncertain:reconcile_started",
      "i1:purchase_uncertain->failed:not_found_at_deriv",
    ]);
    expect(t.requests).toHaveLength(2);
  });

  it("changes nothing when a request to Deriv fails", async () => {
    const t = setup([row()]);
    t.ctl.profit = async () => {
      throw new RequestError("timeout", true);
    };
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ failed: 0, confirmed: 0 });
    expect(t.store.moves).toEqual([]);
  });

  it("changes nothing when a reply cannot be read or may be incomplete", async () => {
    const broken = setup([row()]);
    broken.ctl.portfolio = async () => ({ msg_type: "portfolio" });
    await broken.reconciler.reconcileOnce();
    expect(broken.store.moves).toEqual([]);

    const full = setup([row()]);
    full.ctl.profit = async () =>
      profitReply(Array.from({ length: 500 }, (_, i) => ({ contract_id: i + 1, buy_price: 5 })));
    await full.reconciler.reconcileOnce();
    expect(full.store.moves).toEqual([]);
  });

  it("sends two matching contracts to a human", async () => {
    const t = setup([row()]);
    t.ctl.portfolio = async () =>
      portfolioReply([realEntry, { ...realEntry, contract_id: 17000299660, transaction_id: 32518140360 }]);
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ review: 1, confirmed: 0 });
    expect(t.store.moves).toEqual([
      "i1:purchase_sent->purchase_uncertain:reconcile_started",
      "i1:purchase_uncertain->needs_review:ambiguous_match",
    ]);
  });

  it("sends a match without a transaction number to a human", async () => {
    const t = setup([row()]);
    const { transaction_id: _unused, ...noTransaction } = realEntry;
    t.ctl.portfolio = async () => portfolioReply([noTransaction]);
    await t.reconciler.reconcileOnce();
    expect(t.store.moves[t.store.moves.length - 1]).toBe("i1:purchase_uncertain->needs_review:found_without_transaction_id");
    expect(t.store.confirmed).toEqual([]);
  });

  it("never gives one contract to a second attempt", async () => {
    const t = setup([row({ id: "i2" })]);
    t.store.linked.set(17000299659, "i1"); // already belongs to another attempt
    t.ctl.portfolio = async () => portfolioReply([realEntry]);
    const summary = await t.reconciler.reconcileOnce();
    expect(summary).toMatchObject({ confirmed: 0, failed: 1 });
    expect(t.store.confirmed).toEqual([]);
  });

  it("ignores attempts that belong to another account", async () => {
    const t = setup([row({ accountId: "DOT0000002" })]);
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ checked: 0 });
    expect(t.requests).toHaveLength(0);
  });

  it("does nothing while the connection is not open", async () => {
    const t = setup([row()]);
    t.ctl.status = "closed";
    expect(await t.reconciler.reconcileOnce()).toMatchObject({ checked: 0 });
    expect(t.requests).toHaveLength(0);
  });
});