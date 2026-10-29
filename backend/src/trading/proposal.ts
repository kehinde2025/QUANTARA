import { Decimal } from "decimal.js";
import type { ContractTypeSummary } from "../market/contracts.js";
import { fromDeriv } from "./money.js";

export type DurationUnit = "t" | "s" | "m" | "h" | "d";

export type TradeRequest = {
  symbol: string;
  contractType: "CALL" | "PUT";
  // Decimal text such as "1.00".
  stake: string;
  currency: string;
  duration: number;
  durationUnit: DurationUnit;
};

// The exact price request that worked live on a demo account.
export function buildProposalRequest(t: TradeRequest) {
  return {
    proposal: 1,
    contract_type: t.contractType,
    underlying_symbol: t.symbol,
    currency: t.currency,
    amount: new Decimal(t.stake).toNumber(),
    basis: "stake",
    duration: t.duration,
    duration_unit: t.durationUnit,
  };
}

export type ProposalRequest = ReturnType<typeof buildProposalRequest>;

// ---- Durations ----

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

export function parseDurationText(text: string): { value: number; unit: DurationUnit } | null {
  const match = /^(\d+)([tsmhd])$/.exec(text.trim());
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] as DurationUnit };
}

function expiryTypeFor(unit: DurationUnit): string {
  return unit === "t" ? "tick" : unit === "d" ? "daily" : "intraday";
}

function toBase(d: { value: number; unit: DurationUnit }): number {
  return d.unit === "t" ? d.value : d.value * UNIT_SECONDS[d.unit];
}

export type DurationCheck =
  | { ok: true }
  | { ok: false; reason: "invalid_duration" | "contract_not_listed" | "duration_not_offered" | "duration_out_of_range" };

// Checks a chosen duration against what Deriv currently lists for the contract.
export function validateDuration(
  summary: ContractTypeSummary | undefined,
  duration: number,
  unit: DurationUnit,
): DurationCheck {
  if (!Number.isInteger(duration) || duration <= 0) return { ok: false, reason: "invalid_duration" };
  if (!summary) return { ok: false, reason: "contract_not_listed" };

  const ranges = summary.durations.filter((d) => d.expiryType === expiryTypeFor(unit));
  if (ranges.length === 0) return { ok: false, reason: "duration_not_offered" };

  const wanted = toBase({ value: duration, unit });
  for (const range of ranges) {
    const min = parseDurationText(range.min);
    const max = parseDurationText(range.max);
    if (!min || !max) continue;
    if (wanted >= toBase(min) && wanted <= toBase(max)) return { ok: true };
  }
  return { ok: false, reason: "duration_out_of_range" };
}

// ---- Quotes ----

export type ProposalCheck =
  | { ok: true; id: string; askPrice: Decimal; payout: Decimal }
  | {
      ok: false;
      reason:
        | "deriv_error"
        | "malformed"
        | "mismatch"
        | "bad_price"
        | "no_profit_possible"
        | "price_above_limit"
        | "stale";
    };

// Checks a quote before any purchase may be sent. Every check must pass.
export function validateProposal(
  request: ProposalRequest,
  reply: Record<string, unknown>,
  ctx: { receivedAtMs: number; nowMs: number; maxAskPrice: Decimal; maxAgeMs?: number },
): ProposalCheck {
  if (reply.error) return { ok: false, reason: "deriv_error" };

  const proposal = reply.proposal as Record<string, unknown> | undefined;
  const echo = reply.echo_req as Record<string, unknown> | undefined;
  if (!proposal || typeof proposal !== "object" || !echo || typeof echo !== "object") {
    return { ok: false, reason: "malformed" };
  }

  const id = proposal.id;
  if (typeof id !== "string" || !/^[\w-]{32,128}$/.test(id)) return { ok: false, reason: "malformed" };

  // Deriv must have answered the question we asked.
  if (
    echo.contract_type !== request.contract_type ||
    echo.underlying_symbol !== request.underlying_symbol ||
    echo.currency !== request.currency ||
    echo.duration !== request.duration ||
    echo.duration_unit !== request.duration_unit ||
    Number(echo.amount) !== request.amount
  ) {
    return { ok: false, reason: "mismatch" };
  }

  const askPrice = fromDeriv(proposal.ask_price);
  const payout = fromDeriv(proposal.payout);
  if (!askPrice || !payout || askPrice.lte(0)) return { ok: false, reason: "bad_price" };
  if (payout.lte(askPrice)) return { ok: false, reason: "no_profit_possible" };
  if (askPrice.gt(ctx.maxAskPrice)) return { ok: false, reason: "price_above_limit" };
  if (ctx.nowMs - ctx.receivedAtMs > (ctx.maxAgeMs ?? 5000)) return { ok: false, reason: "stale" };

  return { ok: true, id, askPrice, payout };
}