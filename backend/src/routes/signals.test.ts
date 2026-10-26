import { randomUUID } from "node:crypto";
import { like, not } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../signals/signalService.js", () => ({ listRecentSignals: vi.fn() }));

import { createApp } from "../app.js";
import { FRONTEND_ORIGIN } from "../config.js";
import { db, sql } from "../db/client.js";
import { users } from "../db/schema.js";
import { listRecentSignals } from "../signals/signalService.js";
import type { SignalView } from "../signals/signalService.js";

const TEST_SUFFIX = "@quantara.test";
const PASSWORD = "correct-horse-battery";
const app = createApp();

const view: SignalView = {
  id: "11111111-1111-1111-1111-111111111111",
  strategy: "ema_cross",
  symbol: "R_100",
  direction: "rise",
  contractType: "CALL",
  timeframeSeconds: 60,
  reason: "The fast average crossed above the slow average.",
  details: { fast: 1.5, slow: 1.2 },
  status: "valid",
  createdAt: new Date("2026-10-26T10:00:00.000Z"),
  expiresAt: new Date("2026-10-26T10:01:00.000Z"),
};

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
  vi.mocked(listRecentSignals).mockReset();
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`));
  await sql.end();
});

describe("signals route", () => {
  it("needs a login", async () => {
    expect((await request(app).get("/signals")).status).toBe(401);
    expect(listRecentSignals).not.toHaveBeenCalled();
  });

  it("returns the signals, 50 at most by default", async () => {
    vi.mocked(listRecentSignals).mockResolvedValue([view]);
    const agent = await loggedInAgent();
    const res = await agent.get("/signals");
    expect(res.status).toBe(200);
    expect(res.body.signals).toHaveLength(1);
    expect(res.body.signals[0].status).toBe("valid");
    expect(res.body.signals[0].expiresAt).toBe("2026-10-26T10:01:00.000Z");
    expect(listRecentSignals).toHaveBeenCalledWith({ symbol: undefined, limit: 50 });
  });

  it("passes the market and the limit on", async () => {
    vi.mocked(listRecentSignals).mockResolvedValue([]);
    const agent = await loggedInAgent();
    const res = await agent.get("/signals?symbol=R_50&limit=10");
    expect(res.status).toBe(200);
    expect(listRecentSignals).toHaveBeenCalledWith({ symbol: "R_50", limit: 10 });
  });

  it("rejects a bad market or limit", async () => {
    const agent = await loggedInAgent();
    expect((await agent.get("/signals?symbol=bad%20symbol!")).status).toBe(400);
    expect((await agent.get("/signals?limit=0")).status).toBe(400);
    expect((await agent.get("/signals?limit=500")).status).toBe(400);
    expect(listRecentSignals).not.toHaveBeenCalled();
  });
});