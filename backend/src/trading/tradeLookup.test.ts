import { randomUUID } from "node:crypto";
import { like, not } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, sql } from "../db/client.js";
import { users } from "../db/schema.js";
import { Decimal } from "./money.js";
import {
  applyReading,
  confirmPurchase,
  createIntent,
  findContractByDerivId,
  listUnsettledContracts,
  moveIntent,
} from "./tradeStore.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const TEST_SUFFIX = "@quantara.test";

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
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`));
  await sql.end();
});

async function newUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}${TEST_SUFFIX}`, passwordHash: "x" })
    .returning();
  return user!;
}

// Creates a bought contract for the account and returns it.
async function boughtContract(userId: string, accountId: string, derivContractId: number) {
  const created = await createIntent({
    userId,
    signalId: null,
    accountId,
    accountType: "demo",
    symbol: "R_100",
    contractType: "CALL",
    stake: new Decimal("1"),
    currency: "USD",
    duration: 5,
    durationUnit: "t",
  });
  if (!created.created) throw new Error("expected a new attempt");
  const id = created.intent.id;
  await moveIntent(id, "created", "risk_approved");
  await moveIntent(id, "risk_approved", "proposal_obtained", { proposalId: "p".repeat(36) });
  await moveIntent(id, "proposal_obtained", "purchase_sent", { purchaseSentAt: new Date() });
  const { contract } = await confirmPurchase(id, "purchase_sent", {
    derivContractId,
    derivTransactionId: derivContractId + 1,
    buyPrice: new Decimal("1"),
    payout: null,
    openedAt: new Date(),
  });
  return contract;
}

describe("contract lookups", () => {
  it("finds a contract by its account and Deriv id, and nowhere else", async () => {
    const user = await newUser();
    const n = Math.floor(Math.random() * 1_000_000_000) + 2_000_000_000;
    await boughtContract(user.id, "DOT0000001", n);

    const found = await findContractByDerivId("DOT0000001", n);
    expect(found?.derivContractId).toBe(n);
    expect(found?.userId).toBe(user.id);
    expect(await findContractByDerivId("DOT0000002", n)).toBeNull();
    expect(await findContractByDerivId("DOT0000001", n + 99)).toBeNull();
  });

  it("lists only the unfinished contracts of one account", async () => {
    const user = await newUser();
    const base = Math.floor(Math.random() * 1_000_000_000) + 3_000_000_000;
    const account = `DOT${randomUUID().slice(0, 8)}`;

    const open = await boughtContract(user.id, account, base);
    const done = await boughtContract(user.id, account, base + 10);
    await boughtContract(user.id, `${account}X`, base + 20); // another account

    await applyReading(done.id, {
      state: "settled",
      outcome: "win",
      buyPrice: new Decimal("1"),
      sellPrice: new Decimal("1.92"),
      profit: new Decimal("0.92"),
    });
    await applyReading(open.id, { state: "awaiting_settlement" });

    const list = await listUnsettledContracts(account);
    expect(list.map((c) => c.derivContractId)).toEqual([base]);
    expect(list[0]!.status).toBe("awaiting_settlement");
  });
});