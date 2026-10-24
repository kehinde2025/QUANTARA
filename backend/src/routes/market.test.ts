import { randomUUID } from "node:crypto";
import { like, not } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../market/index.js", () => ({
  marketService: {
    getSymbols: vi.fn(),
    getHistory: vi.fn(),
    snapshot: vi.fn(),
    watch: vi.fn(() => () => {}),
  },
}));

import { createApp } from "../app.js";
import { FRONTEND_ORIGIN } from "../config.js";
import { db, sql } from "../db/client.js";
import { users } from "../db/schema.js";
import { marketService } from "../market/index.js";
import { MarketError } from "../market/marketService.js";

const TEST_SUFFIX = "@quantara.test";
const PASSWORD = "correct-horse-battery";
const app = createApp();

async function loggedInAgent() {
  const agent = request.agent(app);
  await agent
    .post("/auth/register")
    .set("Origin", FRONTEND_ORIGIN)
    .send({ email: `${randomUUID()}${TEST_SUFFIX}`, password: PASSWORD });
  return agent;
}

beforeAll(async () => {
  expect(process.env.NODE_ENV).toBe("test");
  const stranger = await db
    .select({ id: users.id })
    .from(users)
    .where(not(like(users.email, `%${TEST_SUFFIX}`)))
    .limit(1);
  if (stranger.length > 0) {
    throw new Error("The test database contains non-test users. Refusing to run.");
  }
});

beforeEach(() => {
  vi.mocked(marketService.getSymbols).mockReset();
  vi.mocked(marketService.getHistory).mockReset();
  vi.mocked(marketService.snapshot).mockReset();
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`));
  await sql.end();
});

describe("market routes", () => {
  it("needs a login on every market route", async () => {
    expect((await request(app).get("/market/symbols")).status).toBe(401);
    expect((await request(app).get("/market/history?symbol=R_100")).status).toBe(401);
    expect((await request(app).get("/market/stream?symbol=R_100")).status).toBe(401);
  });

  it("returns the symbol list", async () => {
    vi.mocked(marketService.getSymbols).mockResolvedValue([
      {
        symbol: "R_100",
        name: "Volatility 100 Index",
        market: "synthetic_index",
        submarket: "random_index",
        type: "stockindex",
        exchangeIsOpen: true,
        tradingSuspended: false,
      },
    ]);
    const agent = await loggedInAgent();
    const res = await agent.get("/market/symbols");
    expect(res.status).toBe(200);
    expect(res.body.symbols[0].symbol).toBe("R_100");
  });

  it("returns 503 without leaking details when market data is unavailable", async () => {
    vi.mocked(marketService.getSymbols).mockRejectedValue(
      new MarketError("unavailable", "secret internal detail"),
    );
    const agent = await loggedInAgent();
    const res = await agent.get("/market/symbols");
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });

  it("validates the symbol and the count for history", async () => {
    const agent = await loggedInAgent();
    expect((await agent.get("/market/history?symbol=bad%20symbol!")).status).toBe(400);
    expect((await agent.get("/market/history?symbol=R_100&count=5")).status).toBe(400);
    expect((await agent.get("/market/history?symbol=R_100&count=5000")).status).toBe(400);
    expect(marketService.getHistory).not.toHaveBeenCalled();
  });

  it("returns history with the stale flag, defaulting to 300 ticks", async () => {
    vi.mocked(marketService.getHistory).mockResolvedValue({
      symbol: "R_100",
      decimals: 2,
      ticks: [{ epoch: 1, quote: 100 }],
    });
    vi.mocked(marketService.snapshot).mockReturnValue({
      feed: "open",
      silentForMs: 100,
      latest: null,
      ageMs: null,
      stale: true,
    });
    const agent = await loggedInAgent();
    const res = await agent.get("/market/history?symbol=R_100");
    expect(res.status).toBe(200);
    expect(res.body.ticks).toEqual([{ epoch: 1, quote: 100 }]);
    expect(res.body.stale).toBe(true);
    expect(marketService.getHistory).toHaveBeenCalledWith("R_100", 300);
  });

  it("rejects an invalid symbol on the stream", async () => {
    const agent = await loggedInAgent();
    expect((await agent.get("/market/stream?symbol=bad%20symbol!")).status).toBe(400);
  });
});