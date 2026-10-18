import { randomUUID } from "node:crypto";
import { eq, like, not } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "../db/client.js";
import { userSessions, users } from "../db/schema.js";
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSession,
  validateSession,
} from "./sessions.js";
import { hashSessionToken } from "./tokens.js";

// Every user these tests create has an email ending in this suffix.
const TEST_SUFFIX = "@quantara.test";

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}${TEST_SUFFIX}`, passwordHash: "x" })
    .returning();
  return user!;
}

beforeAll(async () => {
  expect(process.env.NODE_ENV).toBe("test");
  // Safety net: if the "test" database holds anything that is not ours,
  // it may be a real database. Stop before touching it.
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
  await db.delete(users).where(like(users.email, `%${TEST_SUFFIX}`)); // sessions cascade
  await sql.end();
});

describe("sessions", () => {
  it("stores a hash of the token, never the token itself", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    const [row] = await db.select().from(userSessions).where(eq(userSessions.userId, user.id));
    expect(row!.tokenHash).toBe(hashSessionToken(token));
    expect(row!.tokenHash).not.toBe(token);
  });

  it("returns the user for a valid token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    const found = await validateSession(token);
    expect(found?.userId).toBe(user.id);
    expect(found?.email).toBe(user.email);
  });

  it("returns null for an unknown token", async () => {
    expect(await validateSession("this-token-does-not-exist")).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const user = await makeUser();
    await db.insert(userSessions).values({
      userId: user.id,
      tokenHash: hashSessionToken("expired-token"),
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await validateSession("expired-token")).toBeNull();
  });

  it("returns null once the account is suspended", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, user.id));
    expect(await validateSession(token)).toBeNull();
  });

  it("keeps two users' sessions separate", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const sessionA = await createSession(a.id);
    const sessionB = await createSession(b.id);
    expect((await validateSession(sessionA.token))?.userId).toBe(a.id);
    expect((await validateSession(sessionB.token))?.userId).toBe(b.id);
  });

  it("deleteSession ends only that session", async () => {
    const user = await makeUser();
    const first = await createSession(user.id);
    const second = await createSession(user.id);
    await deleteSession(first.token);
    expect(await validateSession(first.token)).toBeNull();
    expect(await validateSession(second.token)).not.toBeNull();
  });

  it("deleteAllSessionsForUser ends every session", async () => {
    const user = await makeUser();
    const first = await createSession(user.id);
    const second = await createSession(user.id);
    await deleteAllSessionsForUser(user.id);
    expect(await validateSession(first.token)).toBeNull();
    expect(await validateSession(second.token)).toBeNull();
  });
});