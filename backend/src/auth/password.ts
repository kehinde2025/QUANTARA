import * as argon2 from "argon2";

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, parallelism 1.
const MEMORY_COST_KIB = 19456;
const TIME_COST = 2;
const PARALLELISM = 1;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: MEMORY_COST_KIB,
    timeCost: TIME_COST,
    parallelism: PARALLELISM,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}