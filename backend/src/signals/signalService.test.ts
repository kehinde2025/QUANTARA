import { randomUUID } from "node:crypto";
import { eq, like, not } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "../db/client.js";
import { signals } from "../db/schema.js";
import type { CandidateSignal } from "../strategies/types.js";
import { expireOverdueSignals, getExecutableSignal, listRecentSignals, publishSignal } from "./signalService.js";

const candidate: CandidateSignal = {
  strategy: "ema_cross",
  direction: "rise",
  contractType: "CALL",
  reason: "test signal",
  details: { fast: 1.5, slow: 1.2 },
};

const newSymbol = () => `TEST_${randomUUID().slice(0, 8)}`;
const rowFor = async (id: string) => (await db.select().from(signals).where(eq(signals.id, id)))[0];

beforeAll(async () => {
  expect(process.env.NODE_ENV).toBe("test");
  const stranger = await db
    .select({ id: signals.id })
    .from(signals)
    .where(not(like(signals.symbol, "TEST_%")))
    .limit(1);
  if (stranger.length > 0) {
    throw new Error("The test database contains non-test signals. Refusing to run.");
  }
});

afterAll(async () => {
  await db.delete(signals).where(like(signals.symbol, "TEST_%"));
  await sql.end();
});

describe("signal service", () => {
  it("stores a valid signal that expires 60 seconds after it was created", async () => {
    const symbol = newSymbol();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const result = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate, now });
    expect(result.created).toBe(true);
    const row = await rowFor(result.id!);
    expect(row!.status).toBe("valid");
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(60_000);
    expect(row!.details).toEqual({ fast: 1.5, slow: 1.2 });
    expect(row!.contractType).toBe("CALL");
  });

  it("ignores the same idea for the same candle", async () => {
    const symbol = newSymbol();
    const first = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    const second = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, id: null });
    expect(await listRecentSignals({ symbol })).toHaveLength(1);
  });

  it("stores a second signal for a different candle", async () => {
    const symbol = newSymbol();
    await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    const next = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1060, candidate });
    expect(next.created).toBe(true);
    expect(await listRecentSignals({ symbol })).toHaveLength(2);
  });

  it("marks only overdue signals as expired when it cleans up", async () => {
    const symbol = newSymbol();
    const old = await publishSignal({
      symbol,
      timeframeSeconds: 60,
      candleEpoch: 1000,
      candidate,
      now: new Date(Date.now() - 5 * 60_000),
    });
    const fresh = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1060, candidate });
    const count = await expireOverdueSignals();
    expect(count).toBeGreaterThanOrEqual(1);
    expect((await rowFor(old.id!))!.status).toBe("expired");
    expect((await rowFor(fresh.id!))!.status).toBe("valid");
  });

  it("reports an overdue signal as expired even before the clean-up runs", async () => {
    const symbol = newSymbol();
    const old = await publishSignal({
      symbol,
      timeframeSeconds: 60,
      candleEpoch: 1000,
      candidate,
      now: new Date(Date.now() - 5 * 60_000),
    });
    expect((await rowFor(old.id!))!.status).toBe("valid");
    const [shown] = await listRecentSignals({ symbol });
    expect(shown!.status).toBe("expired");
  });

  it("lists the newest first and respects the limit", async () => {
    const symbol = newSymbol();
    const base = Date.now();
    await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate, now: new Date(base - 2000) });
    await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1060, candidate, now: new Date(base - 1000) });
    await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1120, candidate, now: new Date(base) });
    const two = await listRecentSignals({ symbol, limit: 2 });
    expect(two).toHaveLength(2);
    expect(two[0]!.createdAt.getTime()).toBeGreaterThan(two[1]!.createdAt.getTime());
  });

  it("only hands out a signal that is valid and not expired", async () => {
    const symbol = newSymbol();
    const fresh = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1000, candidate });
    const old = await publishSignal({
      symbol,
      timeframeSeconds: 60,
      candleEpoch: 1060,
      candidate,
      now: new Date(Date.now() - 5 * 60_000),
    });
    const done = await publishSignal({ symbol, timeframeSeconds: 60, candleEpoch: 1120, candidate });
    await db.update(signals).set({ status: "executed" }).where(eq(signals.id, done.id!));

    expect((await getExecutableSignal(fresh.id!))?.id).toBe(fresh.id);
    expect(await getExecutableSignal(old.id!)).toBeNull();
    expect(await getExecutableSignal(done.id!)).toBeNull();
    expect(await getExecutableSignal(randomUUID())).toBeNull();
  });
});