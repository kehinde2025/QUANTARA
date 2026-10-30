import type { AccountConnection, Reply } from "../deriv/accountConnection.js";
import { RequestError } from "../deriv/accountConnection.js";
import type { ContractTypeSummary } from "../market/contracts.js";
import type { SignalView } from "../signals/signalService.js";
import { interpretContract } from "./contractState.js";
import { parseBuyReply } from "./derivReplies.js";
import type { Decimal } from "./money.js";
import { buildProposalRequest, validateDuration, validateProposal } from "./proposal.js";
import type { DurationUnit } from "./proposal.js";
import type {
  applyReading,
  confirmPurchase,
  createIntent,
  findContractByDerivId,
  moveIntent,
} from "./tradeStore.js";

export type TradeStorePort = {
  createIntent: typeof createIntent;
  moveIntent: typeof moveIntent;
  confirmPurchase: typeof confirmPurchase;
  applyReading: typeof applyReading;
  findContractByDerivId: typeof findContractByDerivId;
};

export type ExecuteRequest = {
  userId: string;
  accountId: string;
  accountType: "demo" | "real";
  signalId: string;
  stake: Decimal;
  currency: string;
  duration: number;
  durationUnit: DurationUnit;
};

export type RiskDecision = { approved: true } | { approved: false; reason: string };

export type ExecuteOutcome =
  // Nothing was written.
  | { outcome: "disabled" }
  | { outcome: "refused"; reason: string }
  // Nothing was bought.
  | { outcome: "duplicate" }
  | { outcome: "rejected"; intentId: string; reason: string }
  | { outcome: "failed"; intentId: string; reason: string }
  // It MAY have been bought. Never send it again: check Deriv's records.
  | { outcome: "uncertain"; intentId: string; reason: string }
  | { outcome: "purchased"; intentId: string; contractId: string };

export type EngineDeps = {
  // The one customer and Deriv account this engine acts for.
  userId: string;
  accountId: string;
  store: TradeStorePort;
  buyingEnabled: () => boolean;
  riskGate: (request: ExecuteRequest) => Promise<RiskDecision>;
  // Returns the signal only if it is still valid and not expired.
  getSignal: (id: string) => Promise<SignalView | null>;
  getContractTypes: (symbol: string) => Promise<ContractTypeSummary[]>;
  connection: Pick<AccountConnection, "request" | "getStatus" | "watchContract" | "unwatchContract">;
  now?: () => number;
  log?: (message: string) => void;
  maxQuoteAgeMs?: number;
};

export class TradingEngine {
  private readonly deps: EngineDeps;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  async execute(req: ExecuteRequest): Promise<ExecuteOutcome> {
    const d = this.deps;
    const now = d.now ?? (() => Date.now());
    const maxQuoteAgeMs = d.maxQuoteAgeMs ?? 5000;

    // ---- Checks that write nothing ----
    if (!d.buyingEnabled()) return { outcome: "disabled" };
    if (req.accountType !== "demo") return { outcome: "refused", reason: "real_accounts_disabled" };
    if (req.userId !== d.userId || req.accountId !== d.accountId) {
      return { outcome: "refused", reason: "wrong_account" };
    }
    if (d.connection.getStatus() !== "open") return { outcome: "refused", reason: "not_connected" };

    const signal = await d.getSignal(req.signalId);
    if (!signal) return { outcome: "refused", reason: "signal_not_executable" };
    if (signal.contractType !== "CALL" && signal.contractType !== "PUT") {
      return { outcome: "refused", reason: "unsupported_contract" };
    }
    const contractType = signal.contractType;

    // ---- Write the attempt down ----
    const created = await d.store.createIntent({
      userId: req.userId,
      signalId: signal.id,
      accountId: req.accountId,
      accountType: "demo",
      symbol: signal.symbol,
      contractType,
      stake: req.stake,
      currency: req.currency,
      duration: req.duration,
      durationUnit: req.durationUnit,
    });
    if (!created.created) return { outcome: "duplicate" };
    const id = created.intent.id;

    // ---- Risk gate ----
    const risk = await d.riskGate(req);
    if (!risk.approved) {
      await this.tryMove(id, "created", "rejected", `risk_${risk.reason}`);
      return { outcome: "rejected", intentId: id, reason: `risk_${risk.reason}` };
    }
    if (!(await this.mustMove(id, "created", "risk_approved"))) return this.couldNotRecord(id);

    // ---- Is the duration one Deriv offers for this contract? ----
    let listed: ContractTypeSummary[];
    try {
      listed = await d.getContractTypes(signal.symbol);
    } catch {
      await this.tryMove(id, "risk_approved", "failed", "contract_list_unavailable");
      return { outcome: "failed", intentId: id, reason: "contract_list_unavailable" };
    }
    const duration = validateDuration(
      listed.find((c) => c.contractType === contractType),
      req.duration,
      req.durationUnit,
    );
    if (!duration.ok) {
      await this.tryMove(id, "risk_approved", "rejected", `duration_${duration.reason}`);
      return { outcome: "rejected", intentId: id, reason: `duration_${duration.reason}` };
    }

    // ---- Ask Deriv for a price ----
    const proposalRequest = buildProposalRequest({
      symbol: signal.symbol,
      contractType,
      stake: req.stake.toString(),
      currency: req.currency,
      duration: req.duration,
      durationUnit: req.durationUnit,
    });
    let proposalReply: Reply;
    try {
      proposalReply = await d.connection.request(proposalRequest);
    } catch {
      // A price request is not a purchase: nothing was bought.
      await this.tryMove(id, "risk_approved", "failed", "proposal_request_failed");
      return { outcome: "failed", intentId: id, reason: "proposal_request_failed" };
    }
    const quoteReceivedAt = now();
    const quote = validateProposal(proposalRequest, proposalReply, {
      receivedAtMs: quoteReceivedAt,
      nowMs: now(),
      maxAskPrice: req.stake, // never pay more than the stake
      maxAgeMs: maxQuoteAgeMs,
    });
    if (!quote.ok) {
      await this.tryMove(id, "risk_approved", "rejected", `proposal_${quote.reason}`);
      return { outcome: "rejected", intentId: id, reason: `proposal_${quote.reason}` };
    }
    if (
      !(await this.mustMove(id, "risk_approved", "proposal_obtained", {
        proposalId: quote.id,
        askPrice: quote.askPrice,
        payout: quote.payout,
      }))
    ) {
      return this.couldNotRecord(id);
    }

    // ---- Last look before buying ----
    let blocker: string | null = null;
    const stillValid = await d.getSignal(signal.id);
    if (!d.buyingEnabled()) blocker = "buying_switched_off";
    else if (!stillValid) blocker = "signal_expired_before_purchase";
    else if (d.connection.getStatus() !== "open") blocker = "connection_lost_before_purchase";
    else if (now() - quoteReceivedAt > maxQuoteAgeMs) blocker = "quote_expired_before_purchase";
    else {
      const again = await d.riskGate(req);
      if (!again.approved) blocker = `risk_${again.reason}`;
    }
    if (blocker) {
      await this.tryMove(id, "proposal_obtained", "rejected", blocker);
      return { outcome: "rejected", intentId: id, reason: blocker };
    }

    // ---- Write "purchase sent" BEFORE sending. If we crash after this line,
    // the record shows a purchase was in flight. ----
    if (!(await this.mustMove(id, "proposal_obtained", "purchase_sent", { purchaseSentAt: new Date(now()) }))) {
      return this.couldNotRecord(id);
    }

    // ---- Send the buy, exactly once ----
    let buyReply: Reply;
    try {
      buyReply = await d.connection.request({ buy: quote.id, price: quote.askPrice.toNumber() });
    } catch (error) {
      if (error instanceof RequestError && !error.sent) {
        await this.tryMove(id, "purchase_sent", "rejected", "not_sent");
        return { outcome: "rejected", intentId: id, reason: "not_sent" };
      }
      const code = error instanceof RequestError ? error.code : "unknown";
      await this.tryMove(id, "purchase_sent", "purchase_uncertain", `no_answer_${code}`);
      return { outcome: "uncertain", intentId: id, reason: `no_answer_${code}` };
    }

    const parsed = parseBuyReply(buyReply, new Date(now()));

    if (parsed.kind === "purchased") {
      try {
        const { contract } = await d.store.confirmPurchase(id, "purchase_sent", parsed.purchase);
        d.connection.watchContract(parsed.purchase.derivContractId);
        return { outcome: "purchased", intentId: id, contractId: contract.id };
      } catch (error) {
        // Deriv bought it but we could not record that. The attempt stays marked
        // "purchase_sent", so the check against Deriv's records will find it.
        this.log(`CRITICAL: purchase ${id} reached Deriv but was not recorded: ${describe(error)}`);
        return { outcome: "uncertain", intentId: id, reason: "recording_failed" };
      }
    }

    if (parsed.kind === "error" && parsed.definitelyNotPurchased) {
      await this.tryMove(id, "purchase_sent", "rejected", `deriv_${parsed.code}`);
      return { outcome: "rejected", intentId: id, reason: `deriv_${parsed.code}` };
    }

    const reason = parsed.kind === "error" ? `deriv_error_${parsed.code}` : "malformed_reply";
    await this.tryMove(id, "purchase_sent", "purchase_uncertain", reason);
    return { outcome: "uncertain", intentId: id, reason };
  }

  // Called with every update of a contract being watched. "Settled" only when
  // Deriv says it was sold and its figures agree.
  async onContractUpdate(update: Record<string, unknown>): Promise<void> {
    const d = this.deps;
    const derivContractId = Number(update.contract_id);
    if (!Number.isFinite(derivContractId)) return;

    const contract = await d.store.findContractByDerivId(d.accountId, derivContractId);
    if (!contract) {
      this.log(`update for a contract we do not know: ${derivContractId}`);
      return;
    }
    const reading = interpretContract(update);
    await d.store.applyReading(contract.id, reading, new Date((d.now ?? (() => Date.now()))()));
    if (reading.state === "settled") d.connection.unwatchContract(derivContractId);
  }

  // A move that must succeed before we carry on.
  private async mustMove(
    id: string,
    from: Parameters<TradeStorePort["moveIntent"]>[1],
    to: Parameters<TradeStorePort["moveIntent"]>[2],
    patch: Parameters<TradeStorePort["moveIntent"]>[3] = {},
  ): Promise<boolean> {
    try {
      await this.deps.store.moveIntent(id, from, to, patch);
      return true;
    } catch (error) {
      this.log(`could not record ${from} -> ${to} for ${id}: ${describe(error)}`);
      return false;
    }
  }

  // A move that is only a record of what already happened. A failure is logged.
  private async tryMove(
    id: string,
    from: Parameters<TradeStorePort["moveIntent"]>[1],
    to: Parameters<TradeStorePort["moveIntent"]>[2],
    reason: string,
  ): Promise<void> {
    try {
      await this.deps.store.moveIntent(id, from, to, { stateReason: reason });
    } catch (error) {
      this.log(`could not record ${from} -> ${to} for ${id}: ${describe(error)}`);
    }
  }

  private couldNotRecord(id: string): ExecuteOutcome {
    // Nothing was sent to Deriv when this is returned.
    return { outcome: "failed", intentId: id, reason: "could_not_record" };
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}