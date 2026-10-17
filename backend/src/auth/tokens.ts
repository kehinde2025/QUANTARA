import { createHash, randomBytes } from "node:crypto";

// The secret that goes in the user's cookie. 32 random bytes = 256 bits,
// far too many to guess. base64url keeps it safe to put in a cookie.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// What we store in the database instead of the token itself. If the database
// ever leaks, these hashes can't be turned back into working cookies.
// SHA-256 is fine here because the token is already random and unguessable.
// (Passwords are different: they are guessable, which is why they use argon2.)
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}