import type { Decimal } from "decimal.js";
import { sameAmount } from "./money.js";

// A purchase as seen in Deriv's own records.
export type Candidate = {
  derivContractId: number;
  derivTransactionId: number | null;
  buyPrice: Decimal;
  purchaseTime: Date;
  shortcode: string | null;
  contractType: string | null;
  symbol: string | null;
};

export type IntentFacts = {
  symbol: string;
  contractType: string;
  expectedPrice: Decimal;
  purchaseSentAt: Date;
};

export type MatchResult =
  | { kind: "found"; candidate: Candidate & { derivTransactionId: number } }
  // Nothing matches yet, but not enough time has passed to be sure.
  | { kind: "too_early" }
  // Nothing matches, and enough time has passed.
  | { kind: "not_found" }
  // Cannot tell. A person must look.
  | {
      kind: "ambiguous";
      reason: "several_matches" | "missing_transaction_id" | "unidentifiable_candidate" | "several_attempts";
    };

export type MatchOptions = {
  nowMs: number;
  // True if this Deriv contract already belongs to another attempt.
  isLinked: (derivContractId: number) => boolean;
  // Allowed difference between our clock and Deriv's.
  skewMs?: number;
  // How long to wait before concluding that nothing was bought.
  waitMs?: number;
};

const hasKind = (c: Candidate) => c.shortcode !== null || (c.contractType !== null && c.symbol !== null);

// Deriv's shortcode starts with TYPE_SYMBOL_ (for example CALL_R_100_...). The
// trailing underscore matters: it keeps R_10 apart from R_100.
function sameKind(c: Candidate, intent: IntentFacts): boolean {
  if (c.shortcode !== null) return c.shortcode.startsWith(`${intent.contractType}_${intent.symbol}_`);
  return c.contractType === intent.contractType && c.symbol === intent.symbol;
}

// Works out which of Deriv's purchases, if any, is the one an attempt sent.
// A candidate that cannot be identified is treated as a POSSIBLE match, never
// as "nothing": an unclear picture must not end in "not purchased".
export function matchPurchase(intent: IntentFacts, candidates: Candidate[], opts: MatchOptions): MatchResult {
  const skewMs = opts.skewMs ?? 5_000;
  const waitMs = opts.waitMs ?? 120_000;
  const from = intent.purchaseSentAt.getTime() - skewMs;
  const to = opts.nowMs + skewMs;

  const inWindow = candidates.filter((c) => {
    if (opts.isLinked(c.derivContractId)) return false;
    const t = c.purchaseTime.getTime();
    return t >= from && t <= to && sameAmount(c.buyPrice, intent.expectedPrice);
  });
  const possible = inWindow.filter((c) => !hasKind(c) || sameKind(c, intent));

  if (possible.length === 0) {
    return opts.nowMs - intent.purchaseSentAt.getTime() < waitMs ? { kind: "too_early" } : { kind: "not_found" };
  }
  if (possible.length > 1) return { kind: "ambiguous", reason: "several_matches" };

  const only = possible[0]!;
  if (!hasKind(only)) return { kind: "ambiguous", reason: "unidentifiable_candidate" };
  if (only.derivTransactionId === null) return { kind: "ambiguous", reason: "missing_transaction_id" };
  return { kind: "found", candidate: { ...only, derivTransactionId: only.derivTransactionId } };
}