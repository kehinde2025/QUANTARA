import type { AccountConnection } from "../deriv/accountConnection.js";
import { Decimal } from "./money.js";
import { PROFIT_TABLE_PAGE, matchPurchase, parsePortfolio, parseProfitTable } from "./reconcile.js";
import type { Candidate } from "./reconcile.js";
import type {
  Intent,
  confirmPurchase,
  findContractByDerivId,
  findIntentsNeedingReconciliation,
  moveIntent,
} from "./tradeStore.js";

export type ReconcilerDeps = {
  accountId: string;
  connection: Pick<AccountConnection, "request" | "getStatus" | "watchContract">;
  store: {
    findIntentsNeedingReconciliation: typeof findIntentsNeedingReconciliation;
    moveIntent: typeof moveIntent;
    confirmPurchase: typeof confirmPurchase;
    findContractByDerivId: typeof findContractByDerivId;
  };
  now?: () => number;
  log?: (message: string) => void;
  // An attempt is only checked once it was sent this long ago.
  settleDelayMs?: number;
  // "Not bought" is only concluded this long after the buy was sent.
  notPurchasedAfterMs?: number;
};

export type ReconcileSummary = {
  checked: number;
  confirmed: number;
  failed: number;
  review: number;
  skipped: number;
};

type Doubtful = "purchase_sent" | "purchase_uncertain";

// Settles purchases left in doubt by comparing them with Deriv's own records.
// Whenever anything is unclear it changes nothing and tries again next round.
export class Reconciler {
  private readonly deps: ReconcilerDeps;

  constructor(deps: ReconcilerDeps) {
    this.deps = deps;
  }

  async reconcileOnce(): Promise<ReconcileSummary> {
    const d = this.deps;
    const now = d.now ?? (() => Date.now());
    const summary: ReconcileSummary = { checked: 0, confirmed: 0, failed: 0, review: 0, skipped: 0 };
    if (d.connection.getStatus() !== "open") return summary;

    const cutoff = new Date(now() - (d.settleDelayMs ?? 30_000));
    const waiting = (await d.store.findIntentsNeedingReconciliation(cutoff)).filter(
      (i) =>
        i.accountId === d.accountId &&
        i.purchaseSentAt !== null &&
        (i.state === "purchase_sent" || i.state === "purchase_uncertain"),
    );
    if (waiting.length === 0) return summary; // no requests to Deriv when nothing needs checking

    const earliest = Math.min(...waiting.map((i) => i.purchaseSentAt!.getTime()));
    const candidates = await this.fetchCandidates(Math.floor(earliest / 1000) - 60);
    if (!candidates) {
      this.log("could not read Deriv's records completely; every attempt stays as it is");
      return summary;
    }

    const linked = new Set<number>();
    for (const c of candidates) {
      if (await d.store.findContractByDerivId(d.accountId, c.derivContractId)) linked.add(c.derivContractId);
    }

    for (const intent of waiting) {
      summary.checked++;
      try {
        await this.handle(intent, candidates, linked, now(), summary);
      } catch (error) {
        summary.skipped++;
        this.log(`attempt ${intent.id} could not be settled this round: ${describe(error)}`);
      }
    }
    return summary;
  }

  private async fetchCandidates(sinceEpochSeconds: number): Promise<Candidate[] | null> {
    const connection = this.deps.connection;
    try {
      const open = parsePortfolio(await connection.request({ portfolio: 1 }));
      if (!open) return null;
      const closed = parseProfitTable(
        await connection.request({
          profit_table: 1,
          limit: PROFIT_TABLE_PAGE,
          sort: "DESC",
          date_from: String(sinceEpochSeconds),
        }),
      );
      if (!closed) return null;
      return [...open, ...closed];
    } catch {
      return null;
    }
  }

  private async handle(
    intent: Intent,
    candidates: Candidate[],
    linked: Set<number>,
    nowMs: number,
    summary: ReconcileSummary,
  ): Promise<void> {
    const d = this.deps;
    const sentAt = intent.purchaseSentAt!.getTime();
    const state = intent.state as Doubtful;

    const match = matchPurchase(
      {
        symbol: intent.symbol,
        contractType: intent.contractType,
        stake: new Decimal(intent.stake),
        askPrice: intent.askPrice === null ? null : new Decimal(intent.askPrice),
        purchaseSentAtMs: sentAt,
      },
      candidates,
      { nowMs, notPurchasedAfterMs: d.notPurchasedAfterMs ?? 120_000, linked },
    );

    switch (match.kind) {
      case "too_early":
        summary.skipped++;
        return;

      case "found": {
        const c = match.candidate;
        if (c.transactionId === null) {
          await this.toReview(intent.id, state, "found_without_transaction_id");
          summary.review++;
          return;
        }
        await d.store.confirmPurchase(intent.id, state, {
          derivContractId: c.derivContractId,
          derivTransactionId: c.transactionId,
          buyPrice: c.buyPrice,
          payout: c.payout,
          openedAt: new Date(c.purchaseTimeMs ?? sentAt),
        });
        linked.add(c.derivContractId);
        d.connection.watchContract(c.derivContractId);
        summary.confirmed++;
        return;
      }

      case "ambiguous":
        await this.toReview(intent.id, state, "ambiguous_match");
        summary.review++;
        return;

      case "not_found":
        await this.viaUncertain(intent.id, state);
        await d.store.moveIntent(intent.id, "purchase_uncertain", "failed", { stateReason: "not_found_at_deriv" });
        summary.failed++;
        return;
    }
  }

  // "purchase_sent" must pass through "purchase_uncertain" first.
  private async viaUncertain(id: string, state: Doubtful): Promise<void> {
    if (state === "purchase_sent") {
      await this.deps.store.moveIntent(id, "purchase_sent", "purchase_uncertain", {
        stateReason: "reconcile_started",
      });
    }
  }

  private async toReview(id: string, state: Doubtful, reason: string): Promise<void> {
    await this.viaUncertain(id, state);
    await this.deps.store.moveIntent(id, "purchase_uncertain", "needs_review", { stateReason: reason });
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}