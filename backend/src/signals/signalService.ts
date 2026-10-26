import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { signals } from "../db/schema.js";
import type { CandidateSignal } from "../strategies/types.js";
import { effectiveStatus, expiryFor, isExecutable } from "./signalRules.js";
import type { SignalStatus } from "./signalRules.js";

export type SignalView = {
  id: string;
  strategy: string;
  symbol: string;
  direction: "rise" | "fall";
  contractType: string;
  timeframeSeconds: number;
  reason: string;
  details: Record<string, number>;
  status: SignalStatus;
  createdAt: Date;
  expiresAt: Date;
};

type Row = typeof signals.$inferSelect;

function toView(row: Row, now: Date): SignalView {
  return {
    id: row.id,
    strategy: row.strategy,
    symbol: row.symbol,
    direction: row.direction,
    contractType: row.contractType,
    timeframeSeconds: row.timeframeSeconds,
    reason: row.reason,
    details: row.details,
    status: effectiveStatus(row.status, row.expiresAt, now),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export type PublishInput = {
  symbol: string;
  timeframeSeconds: number;
  // Epoch (seconds) of the latest closed candle that triggered the idea.
  candleEpoch: number;
  candidate: CandidateSignal;
  now?: Date;
};

// Stores a new valid signal. The same strategy, market, timeframe and candle
// can only ever produce one signal; a repeat is ignored.
export async function publishSignal(input: PublishInput): Promise<{ created: boolean; id: string | null }> {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(signals)
    .values({
      strategy: input.candidate.strategy,
      symbol: input.symbol,
      direction: input.candidate.direction,
      contractType: input.candidate.contractType,
      timeframeSeconds: input.timeframeSeconds,
      candleEpoch: input.candleEpoch,
      reason: input.candidate.reason,
      details: input.candidate.details,
      status: "valid",
      createdAt: now,
      expiresAt: expiryFor(now),
    })
    .onConflictDoNothing()
    .returning({ id: signals.id });
  return row ? { created: true, id: row.id } : { created: false, id: null };
}

// Clean-up: marks overdue signals as expired in the database. Returns how many.
export async function expireOverdueSignals(now = new Date()): Promise<number> {
  const rows = await db
    .update(signals)
    .set({ status: "expired" })
    .where(and(inArray(signals.status, ["new", "valid"]), lte(signals.expiresAt, now)))
    .returning({ id: signals.id });
  return rows.length;
}

// Newest first. An overdue signal is reported as expired even if the clean-up
// has not run yet.
export async function listRecentSignals(
  opts: { limit?: number; symbol?: string; now?: Date } = {},
): Promise<SignalView[]> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await db
    .select()
    .from(signals)
    .where(opts.symbol ? eq(signals.symbol, opts.symbol) : undefined)
    .orderBy(desc(signals.createdAt))
    .limit(limit);
  return rows.map((row) => toView(row, now));
}

// The only way the trading engine should fetch a signal to act on: returns
// nothing unless it is valid and not expired.
export async function getExecutableSignal(id: string, now = new Date()): Promise<SignalView | null> {
  const [row] = await db.select().from(signals).where(eq(signals.id, id)).limit(1);
  if (!row || !isExecutable(row.status, row.expiresAt, now)) return null;
  return toView(row, now);
}