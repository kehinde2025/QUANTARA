import { Decimal } from "decimal.js";
import type { LookupResult, PurchaseLookup } from "../deriv/purchaseLookup.js";
import type { TradeStorePort } from "./engine.js";
import { matchPurchase } from "./reconcile.js";
import type { MatchResult } from "./reconcile.js";
import type { Intent, findIntentsNeedingReconciliation } from "./tradeStore.js";

export type ReconcilerDeps = {
  accountId: string;
  userId: string;
  store: Pick<TradeStorePort, "moveIntent" | "confirmPurchase" | "findContractByDerivId"> & {
    findIntentsNeedingReconciliation: typeof findIntentsNeedingReconciliation;
  };
  lookup: PurchaseLookup;
  watchContract: (derivContractId: number) => void;
  now?: () => number;
  log?: (message: string) => void;
  // A purchase counts as stuck once it was sent this long ago without an answer.
  settleAfterMs?: number;
  // Only after this long, with Deriv's records readable and empty, is a purchase
  // declared not bought.
  notPurchasedAfterMs?: number;
};

export type ReconcileSummary = {
  checked: number;
  confirmed: number;
  failed: number;
  needsReview: number;
  waiting: number;
  errors: number;
};

// Checks purchases that were left in doubt against Deriv's own records.
// Rules: a purchase is never sent again; "not bought" is only concluded from
// readable records after a safe wait; anything unclear goes to a person.
export class Reconciler {
  private readonly deps: ReconcilerDeps;

  constructor(deps: ReconcilerDeps) {
    this.deps = deps;
  }

  async reconcileOnce(): Promise<ReconcileSummary> {
    const d = this.deps;
    const nowMs = (d.now ?? (() => Date.now()))();
    const summary: ReconcileSummary = { checked: 0, confirmed: 0, failed: 0, needsReview: 0, waiting: 0, errors: 0 };

    const all = await d.store.findIntentsNeedingReconciliation(new Date(nowMs - (d.settleAfterMs ?? 30_000)));
    const mine = all.filter((intent) => intent.accountId === d.accountId && intent.userId === d.userId);
    summary.checked = mine.length;
    if (mine.length === 0) return summary;

    const earliest = Math.min(...mine.map((i) => (i.purchaseSentAt ?? i.createdAt).getTime()));
    let lookup: LookupResult;
    try {
      lookup = await d.lookup(earliest - 120_000, nowMs);
    } catch {
      lookup = { ok: false, reason: "lookup_failed" };
    }
    if (!lookup.ok) {
      this.log(`could not read Deriv's records (${lookup.reason}); no conclusion drawn`);
      summary.waiting = mine.length;
      return summary;
    }

    const linked = new Set<number>();
    for (const c of lookup.candidates) {
      if (await d.store.findContractByDerivId(d.accountId, c.derivContractId)) linked.add(c.derivContractId);
    }

    // Pass 1: what does each attempt match?
    const results = mine.map((intent) => ({
      intent,
      match: matchPurchase(
        {
          symbol: intent.symbol,
          contractType: intent.contractType,
          expectedPrice: new Decimal(intent.askPrice ?? intent.stake),
          purchaseSentAt: intent.purchaseSentAt ?? intent.createdAt,
        },
        lookup.candidates,
        { nowMs, isLinked: (id) => linked.has(id), waitMs: d.notPurchasedAfterMs ?? 120_000 },
      ) as MatchResult,
    }));

    // Pass 2: if two attempts both match the same purchase, nobody can say which
    // one really made it.
    const claims = new Map<number, number>();
    for (const { match } of results) {
      if (match.kind === "found") {
        claims.set(match.candidate.derivContractId, (claims.get(match.candidate.derivContractId) ?? 0) + 1);
      }
    }

    for (const { intent, match } of results) {
      const contested = match.kind === "found" && (claims.get(match.candidate.derivContractId) ?? 0) > 1;
      const final: MatchResult = contested ? { kind: "ambiguous", reason: "several_attempts" } : match;
      await this.resolve(intent, final, summary);
    }
    return summary;
  }

  private async resolve(intent: Intent, match: MatchResult, summary: ReconcileSummary): Promise<void> {
    const d = this.deps;
    try {
      switch (match.kind) {
        case "too_early":
          summary.waiting++;
          return;
        case "found": {
          const c = match.candidate;
          await d.store.confirmPurchase(intent.id, intent.state, {
            derivContractId: c.derivContractId,
            derivTransactionId: c.derivTransactionId,
            buyPrice: c.buyPrice,
            payout: null,
            openedAt: c.purchaseTime,
          });
          d.watchContract(c.derivContractId);
          summary.confirmed++;
          this.log(`attempt ${intent.id} found at Deriv as contract ${c.derivContractId}`);
          return;
        }
        case "not_found":
          await this.toUncertain(intent);
          await d.store.moveIntent(intent.id, "purchase_uncertain", "failed", {
            stateReason: "verified_not_purchased",
          });
          summary.failed++;
          return;
        case "ambiguous":
          await this.toUncertain(intent);
          await d.store.moveIntent(intent.id, "purchase_uncertain", "needs_review", {
            stateReason: `ambiguous_${match.reason}`,
          });
          summary.needsReview++;
          this.log(`attempt ${intent.id} needs a person to look (${match.reason})`);
          return;
      }
    } catch (error) {
      summary.errors++;
      this.log(`could not resolve attempt ${intent.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private async toUncertain(intent: Intent): Promise<void> {
    if (intent.state === "purchase_sent") {
      await this.deps.store.moveIntent(intent.id, "purchase_sent", "purchase_uncertain", { stateReason: "reconcile" });
    }
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}

