import { randomUUID } from "node:crypto";
import { eq, like, not } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "../db/client.js";
import { users } from "../db/schema.js";
import { authenticateUser, registerUser } from "./users.js";

const TEST_SUFFIX = "@quantara.test";
const newEmail = () => `${randomUUID()}${TEST_SUFFIX}`;

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

describe("registerUser", () => {
  it("creates a user and stores an argon2id hash, never the password", async () => {
    const email = newEmail();
    const result = await registerUser(email, "correct-horse-battery");
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row!.passwordHash).not.toContain("correct-horse-battery");
    expect(row!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row!.role).toBe("user");
    expect(row!.status).toBe("active");
  });

  it("refuses a duplicate email and creates no second user", async () => {
    const email = newEmail();
    await registerUser(email, "correct-horse-battery");
    const second = await registerUser(email, "another-good-password");
    expect(second).toEqual({ ok: false, reason: "email_taken" });
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });
});

describe("authenticateUser", () => {
  it("accepts the correct password", async () => {
    const email = newEmail();
    const registered = await registerUser(email, "correct-horse-battery");
    const result = await authenticateUser(email, "correct-horse-battery");
    expect(result.ok).toBe(true);
    if (result.ok && registered.ok) expect(result.userId).toBe(registered.userId);
  });

  it("rejects a wrong password", async () => {
    const email = newEmail();
    await registerUser(email, "correct-horse-battery");
    expect(await authenticateUser(email, "wrong-password-here")).toEqual({ ok: false });
  });

  it("rejects an unknown email", async () => {
    expect(await authenticateUser(newEmail(), "whatever-password")).toEqual({ ok: false });
  });

  it("rejects a suspended account even with the right password", async () => {
    const email = newEmail();
    await registerUser(email, "correct-horse-battery");
    await db.update(users).set({ status: "suspended" }).where(eq(users.email, email));
    expect(await authenticateUser(email, "correct-horse-battery")).toEqual({ ok: false });
  });
});