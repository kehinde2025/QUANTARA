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
  listUnsettledContractIds,
  moveIntent,
} from "./tradeStore.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const TEST_SUFFIX = "@quantara.test";

async function newUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}${TEST_SUFFIX}`, passwordHash: "x" })
    .returning();
  return user!;
}

// Creates a purchased (open) contract for an account.
async function openContract(userId: string, accountId: string) {
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
  const n = Math.floor(Math.random() * 1_000_000_000) + 2_000_000_000;
  const { contract } = await confirmPurchase(id, "purchase_sent", {
    derivContractId: n,
    derivTransactionId: n + 1,
    buyPrice: new Decimal("1"),
    payout: null,
    openedAt: new Date(),
  });
  return contract;
}

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

describe("contract lookups", () => {
  it("finds a contract by its account and Deriv id, and nowhere else", async () => {
    const user = await newUser();
    const contract = await openContract(user.id, "DOT0000001");
    const n = contract.derivContractId;

    const found = await findContractByDerivId("DOT0000001", n);
    expect(found?.derivContractId).toBe(n);
    expect(found?.userId).toBe(user.id);
    expect(await findContractByDerivId("DOT0000002", n)).toBeNull();
    expect(await findContractByDerivId("DOT0000001", n + 99)).toBeNull();
  });

  it("lists the unsettled contracts of an account, and no settled ones or other accounts'", async () => {
    const user = await newUser();
    const open = await openContract(user.id, "DOT0000007");
    const settled = await openContract(user.id, "DOT0000007");
    await applyReading(settled.id, {
      state: "settled",
      outcome: "win",
      buyPrice: new Decimal("1"),
      sellPrice: new Decimal("1.92"),
      profit: new Decimal("0.92"),
    });
    const other = await openContract(user.id, "DOT0000008");

    const ids = await listUnsettledContractIds("DOT0000007");
    expect(ids).toContain(open.derivContractId);
    expect(ids).not.toContain(settled.derivContractId);
    expect(ids).not.toContain(other.derivContractId);
  });
});