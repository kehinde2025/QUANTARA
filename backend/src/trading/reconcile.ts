import { z } from "zod";
import { Decimal, fromDeriv, sameAmount } from "./money.js";

// One contract as Deriv lists it (open positions or closed history).
export type Candidate = {
  derivContractId: number;
  transactionId: number | null;
  buyPrice: Decimal;
  purchaseTimeMs: number | null;
  shortcode: string | null;
  symbol: string | null;
  contractType: string | null;
  payout: Decimal | null;
};

// Only contract_id and buy_price are required. Everything else is read when
// present. Field names beyond these are UNVERIFIED, so nothing else is assumed.
const looseContract = z.object({
  contract_id: z.number(),
  buy_price: z.union([z.number(), z.string()]),
  purchase_time: z.number().optional(),
  transaction_id: z.number().optional(),
  shortcode: z.string().optional(),
  symbol: z.string().optional(),
  underlying_symbol: z.string().optional(),
  contract_type: z.string().optional(),
  payout: z.union([z.number(), z.string()]).optional(),
});

function candidatesFrom(items: unknown[]): Candidate[] | null {
  const out: Candidate[] = [];
  for (const raw of items) {
    const parsed = looseContract.safeParse(raw);
    if (!parsed.success) return null; // one unreadable entry could be the one we need
    const c = parsed.data;
    const buyPrice = fromDeriv(c.buy_price);
    if (!buyPrice) return null;
    out.push({
      derivContractId: c.contract_id,
      transactionId: c.transaction_id ?? null,
      buyPrice,
      purchaseTimeMs: c.purchase_time !== undefined ? c.purchase_time * 1000 : null,
      shortcode: c.shortcode ?? null,
      symbol: c.underlying_symbol ?? c.symbol ?? null,
      contractType: c.contract_type ?? null,
      payout: c.payout !== undefined ? fromDeriv(c.payout) : null,
    });
  }
  return out;
}

// Open positions. Returns null if the reply cannot be fully read.
export function parsePortfolio(reply: Record<string, unknown>): Candidate[] | null {
  if (reply.error) return null;
  const portfolio = reply.portfolio as { contracts?: unknown } | undefined;
  if (!portfolio || !Array.isArray(portfolio.contracts)) return null;
  return candidatesFrom(portfolio.contracts);
}

// The most results asked for in one page of the closed-contract history.
export const PROFIT_TABLE_PAGE = 500;

// Closed contracts. Returns null if the reply cannot be fully read, or if the
// page is full (older entries might be hidden, so nothing can be concluded).
export function parseProfitTable(reply: Record<string, unknown>): Candidate[] | null {
  if (reply.error) return null;
  const table = reply.profit_table as { transactions?: unknown } | undefined;
  if (!table || !Array.isArray(table.transactions)) return null;
  if (table.transactions.length >= PROFIT_TABLE_PAGE) return null;
  return candidatesFrom(table.transactions);
}

export type IntentSummary = {
  symbol: string;
  contractType: string;
  stake: Decimal;
  askPrice: Decimal | null;
  purchaseSentAtMs: number;
};

export type MatchResult =
  | { kind: "found"; candidate: Candidate }
  | { kind: "ambiguous"; count: number }
  | { kind: "too_early" }
  | { kind: "not_found" };

// How far Deriv's clock and ours may differ. A cautious guess, UNVERIFIED.
const CLOCK_ALLOWANCE_MS = 10_000;

function sameShape(c: Candidate, intent: IntentSummary): boolean {
  if (!sameAmount(c.buyPrice, intent.askPrice ?? intent.stake)) return false;
  if (c.shortcode) return c.shortcode.startsWith(`${intent.contractType}_${intent.symbol}_`);
  return c.symbol === intent.symbol && c.contractType === intent.contractType;
}

// Decides what Deriv's records say about one doubtful purchase.
export function matchPurchase(
  intent: IntentSummary,
  candidates: Candidate[],
  opts: { nowMs: number; notPurchasedAfterMs: number; linked: Set<number> },
): MatchResult {
  const free = candidates.filter((c) => !opts.linked.has(c.derivContractId) && sameShape(c, intent));

  const eligible = free.filter(
    (c) =>
      c.purchaseTimeMs !== null &&
      c.purchaseTimeMs >= intent.purchaseSentAtMs - CLOCK_ALLOWANCE_MS &&
      c.purchaseTimeMs <= opts.nowMs + CLOCK_ALLOWANCE_MS,
  );
  if (eligible.length === 1) return { kind: "found", candidate: eligible[0]! };
  if (eligible.length > 1) return { kind: "ambiguous", count: eligible.length };

  // A contract of the right shape whose time cannot be checked: we cannot say
  // it is not ours, so a human must look.
  const unverifiable = free.filter((c) => c.purchaseTimeMs === null);
  if (unverifiable.length > 0) return { kind: "ambiguous", count: unverifiable.length };

  if (opts.nowMs - intent.purchaseSentAtMs < opts.notPurchasedAfterMs) return { kind: "too_early" };
  return { kind: "not_found" };
}