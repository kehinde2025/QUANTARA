import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { contracts, tradeEvents, tradeIntents } from "../db/schema.js";
import type { ContractReading } from "./contractState.js";
import { assertTransition } from "./intentStates.js";
import type { IntentState } from "./intentStates.js";
import { toDb } from "./money.js";
import type { Decimal } from "./money.js";

export type Intent = typeof tradeIntents.$inferSelect;
export type Contract = typeof contracts.$inferSelect;

export type NewIntent = {
  userId: string;
  signalId: string | null;
  accountId: string;
  accountType: "demo" | "real";
  symbol: string;
  contractType: "CALL" | "PUT";
  stake: Decimal;
  currency: string;
  duration: number;
  durationUnit: string;
};

// Writes a new trade attempt in state "created". A second attempt for the same
// signal on the same account is refused (created: false).
export async function createIntent(input: NewIntent): Promise<{ created: true; intent: Intent } | { created: false }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tradeIntents)
      .values({
        userId: input.userId,
        signalId: input.signalId,
        accountId: input.accountId,
        accountType: input.accountType,
        symbol: input.symbol,
        contractType: input.contractType,
        stake: toDb(input.stake),
        currency: input.currency,
        duration: input.duration,
        durationUnit: input.durationUnit,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return { created: false as const };
    await tx.insert(tradeEvents).values({ intentId: row.id, kind: "state_change", payload: { from: null, to: "created" } });
    return { created: true as const, intent: row };
  });
}

export type IntentPatch = {
  stateReason?: string | null;
  proposalId?: string;
  askPrice?: Decimal;
  payout?: Decimal;
  purchaseSentAt?: Date;
};

// Moves an attempt along an allowed arrow, and only if it is really still in
// the state we think it is. Every move is written to the diary.
export async function moveIntent(
  id: string,
  from: IntentState,
  to: IntentState,
  patch: IntentPatch = {},
): Promise<Intent> {
  assertTransition(from, to);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(tradeIntents)
      .set({
        state: to,
        updatedAt: new Date(),
        ...(patch.stateReason !== undefined ? { stateReason: patch.stateReason } : {}),
        ...(patch.proposalId ? { proposalId: patch.proposalId } : {}),
        ...(patch.askPrice ? { askPrice: toDb(patch.askPrice) } : {}),
        ...(patch.payout ? { payout: toDb(patch.payout) } : {}),
        ...(patch.purchaseSentAt ? { purchaseSentAt: patch.purchaseSentAt } : {}),
      })
      .where(and(eq(tradeIntents.id, id), eq(tradeIntents.state, from)))
      .returning();
    if (!row) throw new Error(`Trade attempt ${id} is not in state ${from}; it was not moved to ${to}`);
    await tx
      .insert(tradeEvents)
      .values({ intentId: id, kind: "state_change", payload: { from, to, reason: patch.stateReason ?? null } });
    return row;
  });
}

export type PurchaseResult = {
  derivContractId: number;
  derivTransactionId: number;
  buyPrice: Decimal;
  payout: Decimal | null;
  openedAt: Date;
};

// Confirms a purchase and creates its contract in ONE step: both happen or
// neither does.
export async function confirmPurchase(
  id: string,
  from: IntentState,
  purchase: PurchaseResult,
): Promise<{ intent: Intent; contract: Contract }> {
  assertTransition(from, "purchase_confirmed");
  return db.transaction(async (tx) => {
    const [intent] = await tx
      .update(tradeIntents)
      .set({
        state: "purchase_confirmed",
        updatedAt: new Date(),
        derivContractId: purchase.derivContractId,
        derivTransactionId: purchase.derivTransactionId,
        buyPrice: toDb(purchase.buyPrice),
      })
      .where(and(eq(tradeIntents.id, id), eq(tradeIntents.state, from)))
      .returning();
    if (!intent) throw new Error(`Trade attempt ${id} is not in state ${from}; the purchase was not confirmed`);

    const [contract] = await tx
      .insert(contracts)
      .values({
        intentId: intent.id,
        userId: intent.userId,
        accountId: intent.accountId,
        accountType: intent.accountType,
        derivContractId: purchase.derivContractId,
        derivTransactionId: purchase.derivTransactionId,
        symbol: intent.symbol,
        contractType: intent.contractType,
        currency: intent.currency,
        buyPrice: toDb(purchase.buyPrice),
        payout: purchase.payout ? toDb(purchase.payout) : null,
        openedAt: purchase.openedAt,
      })
      .returning();

    await tx.insert(tradeEvents).values({
      intentId: id,
      kind: "state_change",
      payload: { from, to: "purchase_confirmed", derivContractId: purchase.derivContractId },
    });
    return { intent, contract: contract! };
  });
}

// Applies what Deriv reports about a contract.
// - "settled" is final: nothing changes it afterwards.
// - A contract never goes backwards (awaiting settlement does not return to open).
// - Contradictory figures mark the contract "unknown" and are logged; no money
//   fields are written.
export async function applyReading(contractId: string, reading: ContractReading, now = new Date()): Promise<Contract> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(contracts).where(eq(contracts.id, contractId)).for("update");
    if (!current) throw new Error(`Unknown contract ${contractId}`);
    if (current.status === "settled") return current;

    const where = eq(contracts.id, contractId);

    if (reading.state === "inconsistent") {
      const [row] = await tx.update(contracts).set({ status: "unknown", lastCheckedAt: now }).where(where).returning();
      await tx
        .insert(tradeEvents)
        .values({ intentId: current.intentId, kind: "contract_inconsistent", payload: { reason: reading.reason } });
      return row!;
    }

    if (reading.state === "settled") {
      const [row] = await tx
        .update(contracts)
        .set({
          status: "settled",
          outcome: reading.outcome,
          sellPrice: toDb(reading.sellPrice),
          profit: toDb(reading.profit),
          settledAt: now,
          lastCheckedAt: now,
        })
        .where(where)
        .returning();
      await tx.insert(tradeEvents).values({
        intentId: current.intentId,
        kind: "contract_settled",
        payload: { outcome: reading.outcome, profit: toDb(reading.profit) },
      });
      return row!;
    }

    // open or awaiting_settlement
    const status =
      reading.state === "open" && current.status === "awaiting_settlement" ? "awaiting_settlement" : reading.state;
    const [row] = await tx.update(contracts).set({ status, lastCheckedAt: now }).where(where).returning();
    return row!;
  });
}

// Attempts that must be checked against Deriv's records: purchases that were
// sent but never confirmed (older than the cutoff), and ones marked uncertain.
export async function findIntentsNeedingReconciliation(olderThan: Date): Promise<Intent[]> {
  return db
    .select()
    .from(tradeIntents)
    .where(
      or(
        eq(tradeIntents.state, "purchase_uncertain"),
        and(eq(tradeIntents.state, "purchase_sent"), lt(tradeIntents.purchaseSentAt, olderThan)),
      ),
    )
    .orderBy(asc(tradeIntents.createdAt));
}

export async function listEvents(intentId: string) {
  return db.select().from(tradeEvents).where(eq(tradeEvents.intentId, intentId)).orderBy(asc(tradeEvents.createdAt));
}

// Finds a contract by the account it belongs to and its Deriv id.
export async function findContractByDerivId(accountId: string, derivContractId: number): Promise<Contract | null> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.accountId, accountId), eq(contracts.derivContractId, derivContractId)))
    .limit(1);
  return row ?? null;
}

// Contracts that have not finished yet (or whose figures looked wrong), for
// one account. After a restart the worker follows these again.
// Deriv ids of this account's contracts that are not settled yet. The worker
// follows these again after every restart or reconnect.
export async function listUnsettledContractIds(accountId: string): Promise<number[]> {
  const rows = await db
    .select({ id: contracts.derivContractId })
    .from(contracts)
    .where(and(eq(contracts.accountId, accountId), inArray(contracts.status, ["open", "awaiting_settlement", "unknown"])));
  return rows.map((row) => row.id);
}