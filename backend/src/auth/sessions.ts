import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { userSessions, users } from "../db/schema.js";
import { generateSessionToken, hashSessionToken } from "./tokens.js";

// A login lasts 7 days from the moment it is created.
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// Called after a successful login. Returns the secret token for the cookie.
// Only a HASH of the token is stored in the database.
export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(userSessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

// Called on every request that needs a logged-in user. Returns the user, or
// null if the token is unknown, expired, or the account is suspended.
export async function validateSession(token: string) {
  const [row] = await db
    .select({
      sessionId: userSessions.id,
      userId: users.id,
      email: users.email,
      role: users.role,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, hashSessionToken(token)),
        gt(userSessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(userSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(userSessions.id, row.sessionId));

  return row;
}

// Logout: ends this one session.
export async function deleteSession(token: string) {
  await db.delete(userSessions).where(eq(userSessions.tokenHash, hashSessionToken(token)));
}

// Ends every session a user has. Used for "log out everywhere", and later
// when an admin suspends an account or a user changes their password.
export async function deleteAllSessionsForUser(userId: string) {
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
}