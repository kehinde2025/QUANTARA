import { z } from "zod";
import { fromDeriv } from "./money.js";
import type { PurchaseResult } from "./tradeStore.js";

// Error codes that mean "Deriv refused this request, nothing was bought".
// Only InputValidationFailed has been SEEN live (on a market-data request).
// The rest come from older Deriv documentation and are UNVERIFIED: confirm each
// on a demo account (Stage 8 part E). Any code not listed here is treated as
// UNCERTAIN, because an error reply does not always mean nothing happened.
const DEFINITELY_NOT_PURCHASED = new Set([
  "InputValidationFailed",
  "InvalidContractProposal",
  "ContractBuyValidationError",
  "InsufficientBalance",
  "PriceMoved",
  "PermissionDenied",
  "AuthorizationRequired",
]);

export function isDefinitelyNotPurchased(code: string): boolean {
  return DEFINITELY_NOT_PURCHASED.has(code);
}

const buyBody = z.object({
  contract_id: z.number(),
  transaction_id: z.number(),
  buy_price: z.union([z.number(), z.string()]),
  payout: z.union([z.number(), z.string()]).optional(),
  purchase_time: z.number().optional(),
});

export type BuyReply =
  | { kind: "purchased"; purchase: PurchaseResult }
  | { kind: "error"; code: string; definitelyNotPurchased: boolean }
  // Neither a purchase nor an error we can read. The purchase may have
  // happened. Treat as UNCERTAIN.
  | { kind: "malformed" };

export function parseBuyReply(reply: Record<string, unknown>, now = new Date()): BuyReply {
  const error = reply.error as { code?: unknown } | undefined;
  if (error && typeof error === "object") {
    const code = typeof error.code === "string" ? error.code : "unknown";
    return { kind: "error", code, definitelyNotPurchased: isDefinitelyNotPurchased(code) };
  }

  const parsed = z.object({ buy: buyBody }).safeParse(reply);
  if (!parsed.success) return { kind: "malformed" };

  const b = parsed.data.buy;
  const buyPrice = fromDeriv(b.buy_price);
  if (!buyPrice || buyPrice.lte(0)) return { kind: "malformed" };
  const payout = b.payout === undefined ? null : fromDeriv(b.payout);

  return {
    kind: "purchased",
    purchase: {
      derivContractId: b.contract_id,
      derivTransactionId: b.transaction_id,
      buyPrice,
      payout,
      openedAt: b.purchase_time !== undefined ? new Date(b.purchase_time * 1000) : now,
    },
  };
}

// The contract details from an open-contract message, or null.
export function parseOpenContract(reply: Record<string, unknown>): Record<string, unknown> | null {
  if (reply.msg_type !== "proposal_open_contract") return null;
  const contract = reply.proposal_open_contract;
  return contract && typeof contract === "object" ? (contract as Record<string, unknown>) : null;
}