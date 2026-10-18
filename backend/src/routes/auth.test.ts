import { randomUUID } from "node:crypto";
import { like, not } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FRONTEND_ORIGIN } from "../config.js";
import { db, sql } from "../db/client.js";
import { users } from "../db/schema.js";

const TEST_SUFFIX = "@quantara.test";
const newEmail = () => `${randomUUID()}${TEST_SUFFIX}`;
const PASSWORD = "correct-horse-battery";
const app = createApp();

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

afterAll(async () => {
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`));
  await sql.end();
});

describe("auth routes", () => {
  it("register logs you in, /me works, and logout kills the session on the server", async () => {
    const agent = request.agent(app);
    const email = newEmail();

    const reg = await agent
      .post("/auth/register")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email, password: PASSWORD });
    expect(reg.status).toBe(201);

    const setCookie = String(reg.headers["set-cookie"]);
    expect(setCookie).toContain("quantara_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(JSON.stringify(me.body)).not.toContain("password");

    const out = await agent.post("/auth/logout").set("Origin", FRONTEND_ORIGIN);
    expect(out.status).toBe(204);

    // Replay the OLD cookie by hand: the server must refuse it.
    const oldCookie = setCookie.split(";")[0]!;
    const replay = await request(app).get("/auth/me").set("Cookie", oldCookie);
    expect(replay.status).toBe(401);
  });

  it("refuses a duplicate email", async () => {
    const email = newEmail();
    await request(app).post("/auth/register").set("Origin", FRONTEND_ORIGIN).send({ email, password: PASSWORD });
    const again = await request(app)
      .post("/auth/register")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email, password: "another-good-password" });
    expect(again.status).toBe(409);
  });

  it("treats the email case-insensitively", async () => {
    const email = newEmail();
    await request(app)
      .post("/auth/register")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email: email.replace("@quantara.test", "@Quantara.TEST"), password: PASSWORD });
    const login = await request(app)
      .post("/auth/login")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const email = newEmail();
    await request(app).post("/auth/register").set("Origin", FRONTEND_ORIGIN).send({ email, password: PASSWORD });
    const wrong = await request(app)
      .post("/auth/login")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email, password: "wrong-password-here" });
    const unknown = await request(app)
      .post("/auth/login")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email: newEmail(), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("rejects a weak password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .set("Origin", FRONTEND_ORIGIN)
      .send({ email: newEmail(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("blocks changes that don't come from our own website", async () => {
    const body = { email: newEmail(), password: PASSWORD };
    const noOrigin = await request(app).post("/auth/register").send(body);
    const evil = await request(app).post("/auth/register").set("Origin", "https://evil.example").send(body);
    expect(noOrigin.status).toBe(403);
    expect(evil.status).toBe(403);
  });

  it("refuses /me without a login", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401);
  });
});