import { describe, expect, it } from "vitest";
import type { LookupResult } from "../deriv/purchaseLookup.js";
import { assertTransition } from "./intentStates.js";
import type { IntentState } from "./intentStates.js";
import { Decimal } from "./money.js";
import { Reconciler } from "./reconciler.js";
import type { ReconcilerDeps } from "./reconciler.js";
import type { Candidate } from "./reconcile.js";

const BASE = 1_792_053_834_000;
const ACCOUNT = "DOT0000001";

type FakeIntent = {
  id: string;
  accountId: string;
  symbol: string;
  contractType: string;
  stake: string;
  askPrice: string | null;
  state: IntentState;
  stateReason: string | null;
  purchaseSentAt: Date;
  createdAt: Date;
  userId: string;
};

const makeIntent = (id: string, over: Partial<FakeIntent> = {}): FakeIntent => ({
  id,
  accountId: ACCOUNT,
  symbol: "R_100",
  contractType: "CALL",
  stake: "1.00000000",
  askPrice: "1.00000000",
  state: "purchase_sent",
  stateReason: null,
  purchaseSentAt: new Date(BASE),
  createdAt: new Date(BASE - 1000),
  ...over,
  userId: "user-1",
});

const makeCandidate = (over: Partial<Candidate> = {}): Candidate => ({
  derivContractId: 17000299659,
  derivTransactionId: 32518140359,
  buyPrice: new Decimal("1"),
  purchaseTime: new Date(BASE),
  shortcode: "CALL_R_100_1.92_1792053834_5T_S0P_0",
  contractType: null,
  symbol: null,
  ...over,
});

class FakeStore {
  intents: FakeIntent[] = [];
  contractsByDerivId = new Map<number, unknown>();
  moves: string[] = [];
  failConfirmFor: string | null = null;

  async findIntentsNeedingReconciliation(olderThan: Date) {
    return this.intents.filter(
      (i) => i.state === "purchase_uncertain" || (i.state === "purchase_sent" && i.purchaseSentAt < olderThan),
    );
  }

  async moveIntent(id: string, from: IntentState, to: IntentState, patch: { stateReason?: string | null } = {}) {
    assertTransition(from, to);
    const intent = this.intents.find((i) => i.id === id);
    if (!intent || intent.state !== from) throw new Error(`not in state ${from}`);
    intent.state = to;
    intent.stateReason = patch.stateReason ?? intent.stateReason;
    this.moves.push(`${id}:${to}`);
    return intent;
  }

  async confirmPurchase(id: string, from: IntentState, purchase: { derivContractId: number }) {
    if (this.failConfirmFor === id) throw new Error("database is down");
    assertTransition(from, "purchase_confirmed");
    const intent = this.intents.find((i) => i.id === id)!;
    intent.state = "purchase_confirmed";
    this.contractsByDerivId.set(purchase.derivContractId, { id: `contract-${id}` });
    this.moves.push(`${id}:purchase_confirmed`);
    return { intent, contract: { id: `contract-${id}` } };
  }

  async findContractByDerivId(_accountId: string, derivContractId: number) {
    return this.contractsByDerivId.get(derivContractId) ?? null;
  }
}

function setup(lookupResult: LookupResult, nowOffsetMs: number) {
  const store = new FakeStore();
  const watched: number[] = [];
  let lookups = 0;
  const reconciler = new Reconciler({
    accountId: ACCOUNT,
    store: store as unknown as ReconcilerDeps["store"],
    lookup: async () => {
      lookups++;
      return lookupResult;
    },
    watchContract: (id) => {
      watched.push(id);
    },
    now: () => BASE + nowOffsetMs,
    log: () => { },
  });
  return { store, watched, reconciler, lookups: () => lookups };
}

const ok = (candidates: Candidate[]): LookupResult => ({ ok: true, candidates });

describe("Reconciler", () => {
  it("confirms a purchase it finds at Deriv, links its contract and follows it", async () => {
    const t = setup(ok([makeCandidate()]), 60_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.confirmed).toBe(1);
    expect(t.store.intents[0]!.state).toBe("purchase_confirmed");
    expect(t.watched).toEqual([17000299659]);
  });

  it("leaves an attempt alone that was sent only moments ago", async () => {
    const t = setup(ok([makeCandidate()]), 5_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.checked).toBe(0);
    expect(t.lookups()).toBe(0);
    expect(t.store.intents[0]!.state).toBe("purchase_sent");
  });

  it("keeps waiting when nothing is found yet and the wait is not over", async () => {
    const t = setup(ok([]), 60_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.waiting).toBe(1);
    expect(t.store.intents[0]!.state).toBe("purchase_sent");
  });

  it("declares a purchase not bought only after the safe wait, from readable records", async () => {
    const t = setup(ok([]), 200_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.failed).toBe(1);
    expect(t.store.intents[0]!.state).toBe("failed");
    expect(t.store.intents[0]!.stateReason).toBe("verified_not_purchased");
    expect(t.store.moves).toEqual(["a:purchase_uncertain", "a:failed"]);
  });

  it("draws no conclusion when Deriv's records cannot be read", async () => {
    const t = setup({ ok: false, reason: "unreadable_reply" }, 200_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.waiting).toBe(1);
    expect(t.store.intents[0]!.state).toBe("purchase_sent");
    expect(t.store.moves).toEqual([]);
  });

  it("sends two identical attempts to review when only one purchase can be seen", async () => {
    const t = setup(ok([makeCandidate()]), 60_000);
    t.store.intents.push(makeIntent("a"), makeIntent("b"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.needsReview).toBe(2);
    expect(summary.confirmed).toBe(0);
    expect(t.store.intents.map((i) => i.state)).toEqual(["needs_review", "needs_review"]);
    expect(t.watched).toEqual([]);
  });

  it("sends a purchase it cannot identify to review instead of guessing", async () => {
    const unknown = makeCandidate({ shortcode: null, contractType: null, symbol: null });
    const t = setup(ok([unknown]), 200_000);
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.needsReview).toBe(1);
    expect(t.store.intents[0]!.state).toBe("needs_review");
    expect(t.store.intents[0]!.stateReason).toContain("unidentifiable");
  });

  it("never links a purchase that already belongs to another attempt", async () => {
    const t = setup(ok([makeCandidate()]), 200_000);
    t.store.contractsByDerivId.set(17000299659, { id: "someone-else" });
    t.store.intents.push(makeIntent("a"));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.confirmed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(t.watched).toEqual([]);
  });

  it("ignores attempts that belong to another customer, even on the same account", async () => {
    const t = setup(ok([makeCandidate()]), 200_000);
    t.store.intents.push(makeIntent("a", { userId: "someone-else" }));
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.checked).toBe(0);
    expect(t.store.intents[0]!.state).toBe("purchase_sent");
  });

  it("keeps going when one attempt cannot be recorded", async () => {
    const putCandidate = makeCandidate({
      derivContractId: 17000299700,
      derivTransactionId: 32518140400,
      shortcode: "PUT_R_50_1.92_1792053834_5T_S0P_0",
    });
    const t = setup(ok([makeCandidate(), putCandidate]), 60_000);
    t.store.intents.push(makeIntent("a"), makeIntent("b", { symbol: "R_50", contractType: "PUT" }));
    t.store.failConfirmFor = "a";
    const summary = await t.reconciler.reconcileOnce();
    expect(summary.errors).toBe(1);
    expect(summary.confirmed).toBe(1);
    expect(t.store.intents.find((i) => i.id === "a")!.state).toBe("purchase_sent");
    expect(t.store.intents.find((i) => i.id === "b")!.state).toBe("purchase_confirmed");
  });
});