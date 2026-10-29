import { randomUUID } from "node:crypto";
import { eq, like, not } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, sql } from "../db/client.js";
import { contracts, signals, tradeIntents, users } from "../db/schema.js";
import { publishSignal } from "../signals/signalService.js";
import { interpretContract } from "./contractState.js";
import { Decimal } from "./money.js";
import {
  applyReading,
  confirmPurchase,
  createIntent,
  findIntentsNeedingReconciliation,
  listEvents,
  moveIntent,
} from "./tradeStore.js";
import type { NewIntent } from "./tradeStore.js";

// These tests make many database round trips.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const TEST_SUFFIX = "@quantara.test";
const candidate = {
  strategy: "ema_cross",
  direction: "rise" as const,
  contractType: "CALL" as const,
  reason: "test",
  details: { fast: 1 },
};

let nextContract = Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000;
const contractNumber = () => nextContract++;

async function newUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}${TEST_SUFFIX}`, passwordHash: "x" })
    .returning();
  return user!;
}

const baseIntent = (userId: string, over: Partial<NewIntent> = {}): NewIntent => ({
  userId,
  signalId: null,
  accountId: "DOT0000001",
  accountType: "demo",
  symbol: "R_100",
  contractType: "CALL",
  stake: new Decimal("1.00"),
  currency: "USD",
  duration: 5,
  durationUnit: "t",
  ...over,
});

async function newIntentId(userId: string, over: Partial<NewIntent> = {}) {
  const result = await createIntent(baseIntent(userId, over));
  if (!result.created) throw new Error("expected a new attempt");
  return result.intent.id;
}

// Walks an attempt up to "purchase_sent", the state a purchase is confirmed from.
async function toPurchaseSent(userId: string, over: Partial<NewIntent> = {}, sentAt = new Date()) {
  const id = await newIntentId(userId, over);
  await moveIntent(id, "created", "risk_approved");
  await moveIntent(id, "risk_approved", "proposal_obtained", {
    proposalId: "p".repeat(36),
    askPrice: new Decimal("1"),
    payout: new Decimal("1.92"),
  });
  await moveIntent(id, "proposal_obtained", "purchase_sent", { purchaseSentAt: sentAt });
  return id;
}

async function openContract(userId: string) {
  const id = await toPurchaseSent(userId);
  const n = contractNumber();
  const { contract } = await confirmPurchase(id, "purchase_sent", {
    derivContractId: n,
    derivTransactionId: n + 1,
    buyPrice: new Decimal("1"),
    payout: new Decimal("1.92"),
    openedAt: new Date(),
  });
  return contract;
}

const intentRow = async (id: string) => (await db.select().from(tradeIntents).where(eq(tradeIntents.id, id)))[0]!;
const contractRow = async (id: string) => (await db.select().from(contracts).where(eq(contracts.id, id)))[0]!;

beforeAll(async () => {
  expect(process.env.NODE_ENV).toBe("test");
  const stranger = await db
    .select({ id: users.id })
    .from(users)
    .where(not(like(users.email, `%${TEST_SUFFIX}`)))
    .limit(1);
  if (stranger.length > 0) {
    throw new Error("The test database contains non-test users. Refusing to run.");
  }
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`)); // attempts, contracts and events follow
  await db.delete(signals).where(like(signals.symbol, "TEST_%"));
  await sql.end();
});

describe("trade attempts", () => {
  it("saves a new attempt in state created with exact money", async () => {
    const user = await newUser();
    const result = await createIntent(baseIntent(user.id, { stake: new Decimal("1.5") }));
    expect(result.created).toBe(true);
    if (!result.created) return;
    expect(result.intent.state).toBe("created");
    expect(result.intent.stake).toBe("1.50000000");
    expect(result.intent.accountType).toBe("demo");
  });

  it("refuses a second attempt for the same signal on the same account", async () => {
    const user = await newUser();
    const symbol = `TEST_${randomUUID().slice(0, 8)}`;
    const signal = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    const first = await createIntent(baseIntent(user.id, { signalId: signal.id }));
    const second = await createIntent(baseIntent(user.id, { signalId: signal.id }));
    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false });
    const rows = await db.select().from(tradeIntents).where(eq(tradeIntents.signalId, signal.id!));
    expect(rows).toHaveLength(1);
  });

  it("allows the same signal on a different account", async () => {
    const user = await newUser();
    const symbol = `TEST_${randomUUID().slice(0, 8)}`;
    const signal = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    await createIntent(baseIntent(user.id, { signalId: signal.id, accountId: "DOT0000001" }));
    const other = await createIntent(baseIntent(user.id, { signalId: signal.id, accountId: "DOT0000002" }));
    expect(other.created).toBe(true);
  });

  it("moves step by step, saves the quote and writes every move to the diary", async () => {
    const user = await newUser();
    const id = await toPurchaseSent(user.id);
    const row = await intentRow(id);
    expect(row.state).toBe("purchase_sent");
    expect(row.askPrice).toBe("1.00000000");
    expect(row.payout).toBe("1.92000000");
    expect(row.purchaseSentAt).not.toBeNull();
    const events = await listEvents(id);
    expect(events.map((e) => e.payload.to)).toEqual([
      "created",
      "risk_approved",
      "proposal_obtained",
      "purchase_sent",
    ]);
  });

  it("refuses an illegal move and leaves the attempt as it was", async () => {
    const user = await newUser();
    const id = await newIntentId(user.id);
    await expect(moveIntent(id, "created", "purchase_sent")).rejects.toThrow("Illegal");
    expect((await intentRow(id)).state).toBe("created");
  });

  it("refuses a move from a state the attempt is no longer in", async () => {
    const user = await newUser();
    const id = await newIntentId(user.id);
    await moveIntent(id, "created", "risk_approved");
    await expect(moveIntent(id, "created", "rejected")).rejects.toThrow("is not in state created");
    expect((await intentRow(id)).state).toBe("risk_approved");
  });
});

describe("purchases and contracts", () => {
  it("confirms a purchase and creates its contract in one step", async () => {
    const user = await newUser();
    const id = await toPurchaseSent(user.id);
    const n = contractNumber();
    const result = await confirmPurchase(id, "purchase_sent", {
      derivContractId: n,
      derivTransactionId: n + 1,
      buyPrice: new Decimal("1"),
      payout: new Decimal("1.92"),
      openedAt: new Date(),
    });
    expect(result.intent.state).toBe("purchase_confirmed");
    expect(result.intent.derivContractId).toBe(n);
    expect(result.contract.status).toBe("open");
    expect(result.contract.intentId).toBe(id);
    expect(result.contract.buyPrice).toBe("1.00000000");
    expect(result.contract.accountId).toBe("DOT0000001");
  });

  it("refuses the same Deriv contract for a second attempt", async () => {
    const user = await newUser();
    const a = await toPurchaseSent(user.id);
    const b = await toPurchaseSent(user.id);
    const n = contractNumber();
    const purchase = {
      derivContractId: n,
      derivTransactionId: n + 1,
      buyPrice: new Decimal("1"),
      payout: null,
      openedAt: new Date(),
    };
    await confirmPurchase(a, "purchase_sent", purchase);
    await expect(confirmPurchase(b, "purchase_sent", purchase)).rejects.toThrow();
    expect((await intentRow(b)).state).toBe("purchase_sent");
    const rows = await db.select().from(contracts).where(eq(contracts.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("makes it impossible to mark an attempt confirmed without a contract", async () => {
    const user = await newUser();
    const id = await newIntentId(user.id);
    await expect(
      db.update(tradeIntents).set({ state: "purchase_confirmed" }).where(eq(tradeIntents.id, id)),
    ).rejects.toThrow();
    expect((await intentRow(id)).state).toBe("created");
  });

  it("follows a contract to settlement and treats settled as final", async () => {
    const user = await newUser();
    const contract = await openContract(user.id);

    expect((await applyReading(contract.id, { state: "open" })).status).toBe("open");
    expect((await applyReading(contract.id, { state: "awaiting_settlement" })).status).toBe("awaiting_settlement");
    // It never goes backwards.
    expect((await applyReading(contract.id, { state: "open" })).status).toBe("awaiting_settlement");

    const settled = await applyReading(contract.id, {
      state: "settled",
      outcome: "win",
      buyPrice: new Decimal("1"),
      sellPrice: new Decimal("1.92"),
      profit: new Decimal("0.92"),
    });
    expect(settled.status).toBe("settled");
    expect(settled.outcome).toBe("win");
    expect(settled.sellPrice).toBe("1.92000000");
    expect(settled.profit).toBe("0.92000000");
    expect(settled.settledAt).not.toBeNull();

    // Settled is final: a later report cannot change it.
    await applyReading(contract.id, { state: "open" });
    await applyReading(contract.id, { state: "inconsistent", reason: "late and wrong" });
    const after = await contractRow(contract.id);
    expect(after.status).toBe("settled");
    expect(after.profit).toBe("0.92000000");
  });

  it("books a real Deriv settlement message exactly", async () => {
    const user = await newUser();
    const contract = await openContract(user.id);
    // The figures of the real demo trade we made earlier.
    const reading = interpretContract({
      is_expired: 1,
      is_sold: 1,
      status: "won",
      buy_price: "1.00",
      sell_price: "1.92",
      profit: "0.92",
    });
    const settled = await applyReading(contract.id, reading);
    expect(settled.status).toBe("settled");
    expect(settled.outcome).toBe("win");
    expect(settled.profit).toBe("0.92000000");
  });

  it("marks contradictory figures unknown, writes no money and logs it", async () => {
    const user = await newUser();
    const contract = await openContract(user.id);
    const row = await applyReading(contract.id, { state: "inconsistent", reason: "profit does not match" });
    expect(row.status).toBe("unknown");
    expect(row.sellPrice).toBeNull();
    expect(row.profit).toBeNull();
    const events = await listEvents(contract.intentId);
    const logged = events.find((e) => e.kind === "contract_inconsistent");
    expect(logged?.payload.reason).toBe("profit does not match");
  });

  it("makes it impossible to store a win with a losing profit", async () => {
    const user = await newUser();
    const contract = await openContract(user.id);
    await expect(
      db
        .update(contracts)
        .set({
          status: "settled",
          outcome: "win",
          sellPrice: "0.00000000",
          profit: "-1.00000000",
          settledAt: new Date(),
        })
        .where(eq(contracts.id, contract.id)),
    ).rejects.toThrow();
    expect((await contractRow(contract.id)).status).toBe("open");
  });
});

describe("attempts in doubt", () => {
  it("finds purchases that were sent long ago or marked uncertain, and nothing else", async () => {
    const user = await newUser();
    const longAgo = new Date(Date.now() - 10 * 60_000);

    const old = await toPurchaseSent(user.id, {}, longAgo);
    const fresh = await toPurchaseSent(user.id);
    const doubtful = await toPurchaseSent(user.id);
    await moveIntent(doubtful, "purchase_sent", "purchase_uncertain");
    const done = await toPurchaseSent(user.id);
    const n = contractNumber();
    await confirmPurchase(done, "purchase_sent", {
      derivContractId: n,
      derivTransactionId: n + 1,
      buyPrice: new Decimal("1"),
      payout: null,
      openedAt: new Date(),
    });

    const found = (await findIntentsNeedingReconciliation(new Date(Date.now() - 60_000))).map((i) => i.id);
    expect(found).toContain(old);
    expect(found).toContain(doubtful);
    expect(found).not.toContain(fresh);
    expect(found).not.toContain(done);
  });
});