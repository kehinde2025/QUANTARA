import { randomBytes, randomUUID } from "node:crypto";
import { eq, like, not } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../deriv/client.js", () => ({ listAccounts: vi.fn() }));

import { createApp } from "../app.js";
import { FRONTEND_ORIGIN } from "../config.js";
import { decryptSecret } from "../crypto/tokenCrypto.js";
import { db, sql } from "../db/client.js";
import { derivConnections, users } from "../db/schema.js";
import { listAccounts } from "../deriv/client.js";

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const TEST_SUFFIX = "@quantara.test";
const PASSWORD = "correct-horse-battery";
const TOKEN = "pat_" + "x".repeat(40);
const ACCOUNTS = [
  { accountId: "DOT0000001", accountType: "demo" as const, currency: "USD", balance: "10000.00", status: "active" },
  { accountId: "ROT0000001", accountType: "real" as const, currency: "USD", balance: "0.00", status: "active" },
];

const app = createApp();
const mockedList = vi.mocked(listAccounts);

async function newUser() {
  const agent = request.agent(app);
  const reg = await agent
    .post("/auth/register")
    .set("Origin", FRONTEND_ORIGIN)
    .send({ email: `${randomUUID()}${TEST_SUFFIX}`, password: PASSWORD });
  return { agent, userId: reg.body.user.id as string };
}

async function savedRow(userId: string) {
  const [row] = await db.select().from(derivConnections).where(eq(derivConnections.userId, userId));
  return row;
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
  mockedList.mockReset();
  mockedList.mockResolvedValue({ ok: true, accounts: ACCOUNTS });
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`)); // connections cascade
  await sql.end();
});

describe("deriv routes", () => {
  it("stores the token encrypted and never returns it", async () => {
    const { agent, userId } = await newUser();
    const res = await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(res.body.selectedAccountId).toBe("DOT0000001");
    expect(mockedList).toHaveBeenCalledWith(TOKEN);

    const row = await savedRow(userId);
    expect(row!.encryptedToken).not.toContain(TOKEN);
    expect(row!.encryptedToken.startsWith("v1.")).toBe(true);
    expect(decryptSecret(row!.encryptedToken, userId)).toBe(TOKEN);
  });

  it("rejects a token Deriv refuses and saves nothing", async () => {
    mockedList.mockResolvedValue({ ok: false, reason: "invalid_token" });
    const { agent, userId } = await newUser();
    const res = await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    expect(res.status).toBe(400);
    expect(await savedRow(userId)).toBeUndefined();
  });

  it("never includes the token when reading the connection or accounts", async () => {
    const { agent } = await newUser();
    await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    const connection = await agent.get("/deriv/connection");
    const accounts = await agent.get("/deriv/accounts");
    expect(connection.status).toBe(200);
    expect(connection.body.connection.status).toBe("active");
    expect(accounts.status).toBe(200);
    expect(accounts.body.accounts).toHaveLength(2);
    for (const body of [connection.body, accounts.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(TOKEN);
      expect(text.toLowerCase()).not.toContain("encrypted");
    }
  });

  it("will not select a real account", async () => {
    const { agent, userId } = await newUser();
    await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    const res = await agent.post("/deriv/select").set("Origin", FRONTEND_ORIGIN).send({ accountId: "ROT0000001" });
    expect(res.status).toBe(403);
    expect((await savedRow(userId))!.selectedAccountId).toBe("DOT0000001");
  });

  it("rejects an account that is not on the customer's Deriv login", async () => {
    const { agent } = await newUser();
    await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    const res = await agent.post("/deriv/select").set("Origin", FRONTEND_ORIGIN).send({ accountId: "NOPE" });
    expect(res.status).toBe(404);
  });

  it("keeps two customers' connections separate", async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    const rowA = await savedRow(a.userId);

    const connectionB = await b.agent.get("/deriv/connection");
    expect(connectionB.body.connection).toBeNull();
    expect((await b.agent.get("/deriv/accounts")).status).toBe(404);
    expect(
      (await b.agent.post("/deriv/select").set("Origin", FRONTEND_ORIGIN).send({ accountId: "DOT0000001" })).status,
    ).toBe(404);

    // B disconnecting must not touch A's saved token.
    expect((await b.agent.delete("/deriv/connection").set("Origin", FRONTEND_ORIGIN)).status).toBe(204);
    expect(await savedRow(a.userId)).toBeDefined();

    // A's stored value cannot be unlocked as B.
    expect(() => decryptSecret(rowA!.encryptedToken, b.userId)).toThrow();
  });

  it("marks the connection invalid when Deriv later rejects the token", async () => {
    const { agent, userId } = await newUser();
    await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    mockedList.mockResolvedValue({ ok: false, reason: "invalid_token" });
    const res = await agent.get("/deriv/accounts");
    expect(res.status).toBe(409);
    expect((await savedRow(userId))!.status).toBe("invalid");
    expect((await agent.get("/deriv/connection")).body.connection.status).toBe("invalid");
  });

  it("disconnect deletes the saved token", async () => {
    const { agent, userId } = await newUser();
    await agent.post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN });
    expect((await agent.delete("/deriv/connection").set("Origin", FRONTEND_ORIGIN)).status).toBe(204);
    expect(await savedRow(userId)).toBeUndefined();
    expect((await agent.get("/deriv/connection")).body.connection).toBeNull();
  });

  it("needs a login for every route", async () => {
    expect((await request(app).get("/deriv/connection")).status).toBe(401);
    expect((await request(app).get("/deriv/accounts")).status).toBe(401);
    expect(
      (await request(app).post("/deriv/connect").set("Origin", FRONTEND_ORIGIN).send({ token: TOKEN })).status,
    ).toBe(401);
  });

  it("blocks changes that don't come from our own website", async () => {
    const { agent } = await newUser();
    const res = await agent.post("/deriv/connect").send({ token: TOKEN });
    expect(res.status).toBe(403);
  });
});