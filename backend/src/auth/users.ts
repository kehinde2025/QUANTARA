import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";

// Hashed once at startup. When someone logs in with an email we don't know,
// we still check their password against this, so "unknown email" takes about
// as long as "wrong password" and an attacker can't tell the two apart.
const DUMMY_HASH = hashPassword("a-password-nobody-will-use");

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "email_taken" };

// Expects an email already cleaned by registerSchema (trimmed and lowercased).
export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!created) return { ok: false, reason: "email_taken" };
  return { ok: true, userId: created.id };
}

export type LoginResult = { ok: true; userId: string } | { ok: false };

// Wrong password, unknown email and suspended account all return the same
// answer, so a caller can't learn which accounts exist.
export async function authenticateUser(email: string, password: string): Promise<LoginResult> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const hashToCheck = user?.passwordHash ?? (await DUMMY_HASH);
  const passwordOk = await verifyPassword(hashToCheck, password);

  if (!user || !passwordOk || user.status !== "active") return { ok: false };
  return { ok: true, userId: user.id };
}