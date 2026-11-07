import { z } from "zod";
import { fromDeriv } from "../trading/money.js";
import type { Candidate } from "../trading/reconcile.js";
import type { AccountConnection, Reply } from "./accountConnection.js";

// Deriv's exact field names in these two replies are UNVERIFIED for the new
// API. They are read strictly: anything that does not fit means the whole reply
// is "unreadable", and nothing is concluded from an unreadable reply.

const price = z.union([z.number(), z.string()]);

const portfolioContract = z.object({
  contract_id: z.number(),
  buy_price: price,
  purchase_time: z.number(),
  transaction_id: z.number().optional(),
  shortcode: z.string().optional(),
  contract_type: z.string().optional(),
  symbol: z.string().optional(),
  underlying_symbol: z.string().optional(),
});
const portfolioReply = z.object({ portfolio: z.object({ contracts: z.array(portfolioContract) }) });

const statementReply = z.object({
  statement: z.object({ transactions: z.array(z.record(z.string(), z.unknown())) }),
});
const buyTransaction = z.object({
  contract_id: z.number(),
  transaction_id: z.number(),
  amount: price,
  transaction_time: z.number(),
  shortcode: z.string().optional(),
});

export type LookupResult = { ok: true; candidates: Candidate[] } | { ok: false; reason: string };

export type PurchaseLookup = (sinceMs: number, nowMs: number) => Promise<LookupResult>;

// Open contracts. Returns null when the reply cannot be read.
export function parsePortfolio(reply: Reply): Candidate[] | null {
  const parsed = portfolioReply.safeParse(reply);
  if (!parsed.success) return null;
  const out: Candidate[] = [];
  for (const c of parsed.data.portfolio.contracts) {
    const buyPrice = fromDeriv(c.buy_price);
    if (!buyPrice) return null;
    out.push({
      derivContractId: c.contract_id,
      derivTransactionId: c.transaction_id ?? null,
      buyPrice,
      purchaseTime: new Date(c.purchase_time * 1000),
      shortcode: c.shortcode ?? null,
      contractType: c.contract_type ?? null,
      symbol: c.underlying_symbol ?? c.symbol ?? null,
    });
  }
  return out;
}

// Every purchase in the window. A purchase shows as a negative amount in the
// statement, so the price paid is its absolute value. Returns null when the
// reply cannot be read.
export function parseStatement(reply: Reply): Candidate[] | null {
  const parsed = statementReply.safeParse(reply);
  if (!parsed.success) return null;
  const out: Candidate[] = [];
  for (const item of parsed.data.statement.transactions) {
    if (item.action_type !== undefined && item.action_type !== "buy") continue;
    const tx = buyTransaction.safeParse(item);
    if (!tx.success) return null;
    const paid = fromDeriv(tx.data.amount);
    if (!paid) return null;
    out.push({
      derivContractId: tx.data.contract_id,
      derivTransactionId: tx.data.transaction_id,
      buyPrice: paid.abs(),
      purchaseTime: new Date(tx.data.transaction_time * 1000),
      shortcode: tx.data.shortcode ?? null,
      contractType: null,
      symbol: null,
    });
  }
  return out;
}

// The same contract can show in both lists. Keep one entry and fill in what
// either list knows.
export function mergeCandidates(a: Candidate[], b: Candidate[]): Candidate[] {
  const byId = new Map<number, Candidate>();
  for (const c of [...a, ...b]) {
    const existing = byId.get(c.derivContractId);
    byId.set(
      c.derivContractId,
      existing
        ? {
            ...existing,
            derivTransactionId: existing.derivTransactionId ?? c.derivTransactionId,
            shortcode: existing.shortcode ?? c.shortcode,
            contractType: existing.contractType ?? c.contractType,
            symbol: existing.symbol ?? c.symbol,
          }
        : c,
    );
  }
  return [...byId.values()];
}

// Asks Deriv for open contracts AND for every purchase in the window. If either
// request fails or either reply cannot be read, there is no answer at all.
export function createPurchaseLookup(connection: Pick<AccountConnection, "request">): PurchaseLookup {
  return async (sinceMs, nowMs) => {
    let portfolio: Reply;
    let statement: Reply;
    try {
      [portfolio, statement] = await Promise.all([
        connection.request({ portfolio: 1 }),
        connection.request({
          statement: 1,
          action_type: "buy",
          date_from: Math.floor(sinceMs / 1000),
          date_to: Math.ceil(nowMs / 1000) + 60,
          description: 1,
        }),
      ]);
    } catch {
      return { ok: false, reason: "request_failed" };
    }
    if (portfolio.error || statement.error) return { ok: false, reason: "deriv_error" };

    const open = parsePortfolio(portfolio);
    const bought = parseStatement(statement);
    if (!open || !bought) return { ok: false, reason: "unreadable_reply" };
    return { ok: true, candidates: mergeCandidates(open, bought) };
  };
}